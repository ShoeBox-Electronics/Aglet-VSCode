import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Diagnostic,
  DiagnosticSeverity,
  MarkupContent,
} from "vscode-languageserver/node"

import { TextDocument } from "vscode-languageserver-textdocument"

import * as fs from 'fs'
import simpleGit, { SimpleGit } from 'simple-git'
import { spawn } from 'child_process'
import * as rimraf from 'rimraf'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all)

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let INSTALLED: boolean = false
let PROGRAM: string = ''

function command(command: string, args: string[], opts: any, onoutput: any, input_data: string = ''): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, opts)
    process.stdout.on('data', data => {
      data.toString().split('\n').forEach((line: string) => {
        if (line) onoutput(line)
      })
    })

    process.stderr.on('data', data => {
      data.toString().split('\n').forEach((line: string) => {
        if (line) onoutput(line)
      })
    })

    process.on('error', err => {
      reject(err)
    })

    process.on('close', () => {
      resolve()
    })

    process.on('timeout', () => {
      process.kill()
      reject(new Error('Command timed out'))
    })

    process.stdin.write(input_data)
    process.stdin.end()
  })
}

async function install_compiler() {
  const git: SimpleGit = simpleGit()
  const dir = __dirname + '/build'

  // try {
  //   await rimraf.rimraf(dir)
  // } catch (err: any) {
  //   connection.sendNotification('error', err.toString())
  // }

  try { fs.statSync(dir) }
  catch (_) {
    try {
      connection.sendNotification('status', 'Downloading Aglet compiler...')
      await git.clone('https://github.com/ShoeBox-Electronics/Aglet.git', dir)
    } catch (e) {
      connection.sendNotification('error', 'Failed to install Aglet compiler')
      connection.sendNotification('hide-status')
      return
    }
  }

  try {
    PROGRAM = dir + '/target/release/aglet.exe'
    fs.statSync(PROGRAM)
  }
  catch (_) {
    try {
      PROGRAM = dir + '/target/release/aglet'
      fs.statSync(PROGRAM)
    }
    catch (_) {
      //The aglet compiler exists but has not been built.
      connection.sendNotification('status', 'Found Aglet installation. Building...')

      await command('cargo', ['build', '--release'], {cwd: dir}, (line: string) => {
        connection.sendNotification('status', line)
      })

      //Final check to make sure that the install went through ok.
      try {
        PROGRAM = dir + '/target/release/aglet.exe'
        fs.statSync(PROGRAM)
      }
      catch (_) {
        try {
          PROGRAM = dir + '/target/release/aglet'
          fs.statSync(PROGRAM)
        } catch (_) {
          connection.sendNotification('error', 'Failed to build Aglet compiler')
          return
        }
      }

    }
  }

  INSTALLED = true
  connection.sendNotification('hide-status')
}

connection.onInitialize((params: InitializeParams) => {
  connection.onInitialized(() => {
    install_compiler()
  })

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  }

  return result
});

documents.onDidChangeContent((change) => {
  if (INSTALLED)
  {
    let diagnostics: Diagnostic[] = [];
    const text = change.document.getText().replace(/[\t\n\r]/g, ' ')

    command(PROGRAM, ['--language-server', '-'], {timeout: 2000}, (line: string) => {
      const info = line.split('|')
      diagnostics.push({
        severity: {
          E: DiagnosticSeverity.Error,
          W: DiagnosticSeverity.Warning,
          H: DiagnosticSeverity.Hint,
          I: DiagnosticSeverity.Information,
        }[info[0]],
        range: {
          start: change.document.positionAt(parseInt(info[1])),
          end: change.document.positionAt(parseInt(info[2])),
        },
        message: info[3],
        source: 'Aglet',
      })
    }, text).then(() => {
      connection.sendDiagnostics({ uri: change.document.uri, diagnostics })
    })
  }
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
