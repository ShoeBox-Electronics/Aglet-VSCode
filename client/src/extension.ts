import * as path from "path"
import {
  window,
  StatusBarAlignment,
  languages,
  workspace,
  ExtensionContext,
  SemanticTokensLegend,
  TextDocument,
  CancellationToken,
  SemanticTokens,
  SemanticTokensBuilder,
} from "vscode"

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node"

let client: LanguageClient
let constants: number[] = []
let resolve_loaded: Function = () => {}
let loaded = new Promise((resolve: Function) => {
	resolve_loaded = resolve
})
const tokenTypes = new Map<string, number>()
const tokenModifiers = new Map<string, number>()

const legend = (function() {
	const tokenTypesLegend = [
		'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
		'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
		'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label'
	]
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index))

	const tokenModifiersLegend = [
		'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
		'modification', 'async'
	]
	tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index))

	return new SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
})()

export function activate(context: ExtensionContext) {
  context.subscriptions.push(languages.registerDocumentSemanticTokensProvider({ language: 'aglet' }, new DocumentSemanticTokensProvider(), legend))

  const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left)

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  )

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  }

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for all documents by default
    documentSelector: [{ scheme: "file", language: "aglet" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  }

  // Create the language client and start the client.
  client = new LanguageClient(
    "aglet",
    "Aglet Language Server",
    serverOptions,
    clientOptions
  )

  client.onNotification('status', params => {
    statusBarItem.text = params
    statusBarItem.show()
  })

  client.onNotification('hide-status', () => {
    statusBarItem.hide()
	resolve_loaded()
  })

  client.onNotification('error', params => {
    window.showErrorMessage(params)
  })

  client.onNotification('constants', params => {
	constants = params
  })

  // Start the client. This will also launch the server
  client.start()
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined
  }
  return client.stop()
}

interface IParsedToken {
	line: number
	startCharacter: number
	length: number
	tokenType: string
	tokenModifiers: string[]
}

class DocumentSemanticTokensProvider implements DocumentSemanticTokensProvider {
	async provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken): Promise<SemanticTokens> {
		await loaded

		setTimeout(() => resolve_loaded(), 200)

		await new Promise((resolve: Function) => {
			resolve_loaded = resolve
		})

		const builder = new SemanticTokensBuilder()

		for (let i = 0; i < constants.length; i += 3)
		{
			builder.push(
				constants[i], constants[i+1], constants[i+2], //line, start char, length
				this._encodeTokenType('variable'),
				this._encodeTokenModifiers(['readonly']),
			)
		}
		return builder.build()
	}

	private _encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.size + 2
		}
		return 0
	}

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i]
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!)
			} else if (tokenModifier === 'notInLegend') {
				result = result | (1 << tokenModifiers.size + 2)
			}
		}
		return result
	}
}
