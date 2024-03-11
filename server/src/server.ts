import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Diagnostic,
  DiagnosticSeverity,
  SemanticTokenTypes,
  SemanticTokenModifiers,
  SemanticTokensLegend,
} from "vscode-languageserver/node"

import { TextDocument } from "vscode-languageserver-textdocument"

import * as fs from 'fs'
import { spawn } from 'child_process'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all)

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let INSTALLED: boolean = false
let INSTALL_ATTEMPTED: boolean = false
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
  INSTALL_ATTEMPTED = true
  const dir = __dirname + '/build'

  try { fs.statSync(dir) }
  catch (_) {
    try {
      connection.sendNotification('status', 'Downloading Aglet compiler...')
      await command('git', ['clone', 'https://github.com/ShoeBox-Electronics/Aglet.git', dir], {}, () => {})
      try { fs.statSync(dir) }
      catch (e) {
        connection.sendNotification('error', 'Failed to clone Aglet compiler')
        connection.sendNotification('hide-status')
        return
      }
    } catch (e) {
      connection.sendNotification('error', 'Failed to install Aglet compiler')
      connection.sendNotification('hide-status')
      return
    }
  }

  connection.sendNotification('status', 'Checking for updates...')
  await command('git', ['pull'], {cwd: dir}, () => {})

  await command('cargo', ['build', '--release'], {cwd: dir}, (line: string) => {
    connection.sendNotification('status', line)
  })

  //Final check to make sure that the install went through ok.
  PROGRAM = dir + '/target/release/aglet.exe'
  try {
    await fs.promises.access(PROGRAM, fs.constants.F_OK)
  } catch (_) {
    try {
      PROGRAM = dir + '/target/release/aglet'
      await fs.promises.access(PROGRAM, fs.constants.F_OK)
    } catch (_) {
      connection.sendNotification('error', 'Failed to build Aglet compiler')
      return
    }
  }

  INSTALLED = true
  connection.sendNotification('hide-status')
}

connection.onInitialize((params: InitializeParams) => {

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  }

  return result
});

documents.onDidChangeContent(async (change) => {
  if (!INSTALL_ATTEMPTED) {
    await install_compiler()
  }

  if (INSTALLED)
  {
    let diagnostics: Diagnostic[] = []
    let constants: number[] = []

    const text = change.document.getText().replace(/[\t\n\r]/g, ' ')

    command(PROGRAM, ['--language-server', '-'], {timeout: 2000}, (line: string) => {
      const info = line.split('|')
      const msg_type = info[0]
      const start = change.document.positionAt(parseInt(info[1]))
      const stop = change.document.positionAt(parseInt(info[2]))

      if (msg_type === 'C')
      {
        constants.push(start.line, start.character, stop.character - start.character)
        return
      }

      if (!['E', 'W', 'H', 'I'].includes(msg_type)) return

      diagnostics.push({
        severity: {
          E: DiagnosticSeverity.Error,
          W: DiagnosticSeverity.Warning,
          H: DiagnosticSeverity.Hint,
          I: DiagnosticSeverity.Information,
        }[msg_type],
        range: {
          start: start,
          end: stop,
        },
        message: info[3],
        source: 'Aglet',
      })
    }, text).then(() => {
      connection.sendDiagnostics({ uri: change.document.uri, diagnostics })
      connection.sendNotification('constants', constants)
    })
  }
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
