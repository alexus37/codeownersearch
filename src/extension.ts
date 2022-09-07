// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec } from "child_process";
import path = require("path");
import * as vscode from "vscode";

const MAX_DESC_LENGTH = 1000;

interface QuickPickItemWithLine extends vscode.QuickPickItem {
  num: number;
}

function search(
  searchString: string,
  globList: string[],
  workspaceRoot: string
): Promise<QuickPickItemWithLine[]> {
  return new Promise((resolve, reject) => {
    const command = `rg ${searchString} -n ${globList
      .map((g) => `${g.substring(1)}`)
      .join(" ")}`;

    exec(command, { cwd: workspaceRoot }, (err, stdout, stderr) => {
      if (err) {
        console.log(`Error: ${err}`);
      }
      if (stderr) {
        vscode.window.showErrorMessage(stderr);
        console.log(stderr);
      }

      const lines = stdout.split(/\n/).filter((l) => l !== "") as string[];
      if (!lines.length) {
        vscode.window.showInformationMessage("There are no items.");
        console.log("There are no items.");
        return resolve([]);
      }
      console.log(`Found ${lines.length} items.`);

      const result = lines
        .map((line) => {
          const [fullPath, num, ...desc] = line.split(":");
          const description = desc.join(":").trim();
          return {
            fullPath,
            num: Number(num),
            line,
            description,
          };
        })
        .filter(
          ({ description, num }) =>
            description.length < MAX_DESC_LENGTH && !!num
        )
        .map(({ fullPath, num, description }) => {
          const path = fullPath.split("/");
          return {
            label: `${path[path.length - 1]} : ${num}`,
            description,
            detail: fullPath,
            num,
          };
        });

      return resolve(result);
    });
  });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "codeownersearch" is now active!'
  );
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage("Open a folder/workspace first");
    return;
  }

  const rootWS = vscode.workspace.workspaceFolders[0].uri.fsPath;
  let codeownerLines: string[] | undefined = undefined;
  let allCodeowners: Set<string> | undefined = undefined;
  try {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(rootWS, "CODEOWNERS"))
    );
    codeownerLines = doc.getText().split(/\r\n|\r|\n/);
    allCodeowners = new Set();

    codeownerLines.forEach((line) => {
      const codeowners = line.split(/\s+/);
      codeowners.forEach((codeowner) => {
        if (codeowner.startsWith("@") && allCodeowners) {
          allCodeowners.add(codeowner);
        }
      });
    });
  } catch (e) {
    vscode.window.showErrorMessage("CODEOWNERS file not found.");
    return;
  }

  let disposable = vscode.commands.registerCommand(
    "codeownersearch.searchByCodeOwner",
    async () => {
      const searchString = await vscode.window.showInputBox({
        prompt: "Please input search word.",
      });

      if (!codeownerLines || !allCodeowners) {
        vscode.window.showErrorMessage("CODEOWNERS file not found.");
        return;
      }

      if (!searchString) {
        return;
      }

      const codeownerItem = await vscode.window.showQuickPick(
        [...allCodeowners].map((codeowner) => {
          return {
            label: codeowner,
            description: "",
          } as vscode.QuickPickItem;
        })
      );

      if (!codeownerItem) {
        return;
      }

      const codeowner = codeownerItem.label;
      const globs = codeownerLines
        .filter((line) => line.includes(codeowner))
        .map((line) => line.split(" ")[0].trim());

      const options: vscode.QuickPickOptions = { matchOnDescription: true };
      const item = await vscode.window.showQuickPick(
        search(searchString, globs, rootWS),
        options
      );
      if (!item) {
        return;
      }

      const { detail, num } = item;
      const selectedDoc = await vscode.workspace.openTextDocument(
        rootWS + "/" + detail
      );
      await vscode.window.showTextDocument(selectedDoc);
      if (vscode.window.activeTextEditor) {
        vscode.window.activeTextEditor.selection = new vscode.Selection(
          ~~num,
          0,
          ~~num,
          0
        );
        vscode.commands.executeCommand("cursorUp");
        context.subscriptions.push(disposable);
      }
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
