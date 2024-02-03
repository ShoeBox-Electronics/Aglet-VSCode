# Aglet-VSCode
Language support for the Aglet programming language.

To build this package, you will need vcse installed.
```
npm install -g @vscode/vsce
```

Once that's installed, run the following to build the vcix file. It should create some `aglet-X.Y.Z.vsix` file.
```
vsce package
```

Now you can install the package. In VSCode, go to extensions (Ctrl+Shift+X), click Views and More Actions (three dots in the top left of the sidebar), then click Install From VSIX and select the file you just created.
