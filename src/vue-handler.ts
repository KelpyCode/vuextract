import { CodegenResult, compile, CompilerError, NodeTypes, RootNode, TemplateChildNode } from '@vue/compiler-dom';
import { showMessage } from './helper';
import * as vscode from 'vscode';
import jsConvert from 'js-convert-case';
import { Identifier } from "@typescript-eslint/types/dist/generated/ast-spec";


function getTemplatePart(code: string) {
    // Get all code between <template> and </template>
    const { templateStart, templateEnd } = getTemplateLocation(code);
    return code.substring(templateStart, templateEnd);
}

export function getTemplateLocation(code: string) {
    const templateStart = code.indexOf('<template>');
    const templateEnd = code.indexOf('</template>') + '</template>'.length;
    return { templateStart, templateEnd };
}

export function clearCode(code: string) {
    return getTemplatePart(code);
}


export function parseVue(code: string) {
    return compile(clearCode(code), {
        isTS: true,
        onError: (error: CompilerError) => {
            console.error(error);
            showMessage('Parsing failed: ' + error.message, 'error');
        },

    });
}

export function getAbsoluteLine(originalCode: string, line: number) {
  const templateOffset = getTemplateLocation(originalCode).templateStart;
  const previousLines = originalCode
    .substring(0, templateOffset)
    .split("\n").length;

  return line + previousLines - 2;
}

export function getAbsoluteStart(originalCode: string) {
  const templateOffset = getTemplateLocation(originalCode).templateStart;
  const previousLines = originalCode
    .substring(0, templateOffset)
    .split("\n").length;

  return previousLines - 1;
}


export function getElementsInRange(originalCode: string, rootNode: RootNode, selection: vscode.Selection): TemplateChildNode | undefined {
    const templateOffset = getTemplateLocation(originalCode).templateStart;
    const previousLines = originalCode.substring(0, templateOffset).split('\n');

    const relativeLine = (line: number) => ((line + 1) - previousLines.length) + 1;

    const relativeStartLine = relativeLine(selection.start.line);
    const relativeEndLine = relativeLine(selection.end.line);
    const startCharacter = selection.start.character + 1;
    const endCharacter = selection.end.character + 1;
    
    let nodeOut: RootNode | TemplateChildNode | undefined = undefined;

    traverseVueNode(rootNode, node => {
        // console.log('Traversed', node.type, node.loc);
        // console.log(node.loc.start.line, relativeStartLine, node.loc.start.column, startCharacter);
        if (node.loc && node.loc.start.line === relativeStartLine && node.loc.start.column === startCharacter) {
            nodeOut = node;
            return false;
        }
    });
    
    return nodeOut;
}

export function traverseVueNode(node: RootNode | TemplateChildNode, callback: (node: RootNode | TemplateChildNode) => boolean | void) {
    const result = callback(node);
    if (result === false) {return;};
    
    if (
        (node as any).children !== undefined
      /*node.type === NodeTypes.ELEMENT ||
      node.type === NodeTypes.ROOT ||
      node.type === NodeTypes.COMPOUND_EXPRESSION*/
    ) {
      (node as any).children.forEach((child: any) => traverseVueNode(child, callback));
    }
}



export function newComponentCall(name: string, identifiers: string[]) {
    let code = "<" + jsConvert.toPascalCase(name) + " ";
    identifiers.forEach((identifier) => {
        code += `:${jsConvert.toKebabCase(identifier)}="${identifier}" `;
    });

    code += ' />';

    return code;
}

export function newComponentSource(name: string, content: string, identifierDefinitions: [Identifier, string][]) {
    let code = '<template>\n';
    code += content;
    code += '\n</template>\n\n';

    code += '<script lang="ts" setup>\n';

    code += "import { defineProps } from 'vue';\n";
    code += "\n";
    code += "interface Props {\n";
    identifierDefinitions.forEach((x) => {
        code += `  ${x[0].name}: ${x[1]};\n`;
    });
    code += "}\n";
    code += "\n";
    code += "defineProps<Props>()\n\n";
    code += '</script>\n';

    return code;
}