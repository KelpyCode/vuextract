import * as vscode from 'vscode';

type MessageType = 'info' | 'warning' | 'error';

const MESSAGE_PREFIX = 'Vuextract: ';

export function showMessage(message: string, type: MessageType = 'info') {
    let fn: typeof vscode.window.showInformationMessage | null = null;
    switch (type) {
        case 'info':
            fn = vscode.window.showInformationMessage;
            break;
        case 'warning':
            fn = vscode.window.showWarningMessage;
            break;
        case 'error':
            fn = vscode.window.showErrorMessage;
            break;
    }

    fn(MESSAGE_PREFIX + message);
}

function removeDoubleSpaces(str: string) {
    return str.replace(/  +/g, ' ');
}

export async function getTypeOfDefinition(uri: vscode.Uri, position: vscode.Position, offset = false) {
    const definitions = await getHoverProvider(uri, offset ? new vscode.Position(position.line - 1, position.character - 1) : position);
    if (definitions.length === 0) {
        return null;
    }

    const definition = definitions[0];

    // console.log('Matching definition', definition.contents);

    const matchParameterDefinition = (text: string) => {
        let t = text.replace(/(\n|\\n)/g, ' ');
        const match = t.match(/(?:\w+): ?(.*?)\`\`\`$/m);
        if (match === null || !match[1]) { return null; };
        if(match[1].includes('`')) {return null;}; // Failed to match somehow
        return removeDoubleSpaces(match[1]);
    };

    let ret: string | null = null;
    definition.contents.forEach(x => {
        const value = (x as any).value;
        console.log('Testing definition', value);
        const param = matchParameterDefinition(value);

        if (param) {
            console.log('Got definition', param);
            ret = param;
        }
    });

    return ret;
}

export function getDefinitionProvider(uri: vscode.Uri, position: vscode.Position) {
  return vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    uri,
    position
  ) as Thenable<(vscode.Location | vscode.LocationLink)[]>;
}

export function getSymbolProvider(uri: vscode.Uri) {
  return vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    uri
  ) as Thenable<vscode.SymbolInformation[]>;
}

export function getHoverProvider(uri: vscode.Uri, position: vscode.Position) {
  return vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    uri,
    position
  ) as Thenable<vscode.Hover[]>;
}