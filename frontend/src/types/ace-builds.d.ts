import "ace-builds";

declare module "ace-builds" {
  namespace Ace {
    interface CommandManager {
      // "commandKeyBinding" is not typed, but used in the code, and it works. So, adding an explicit typing here
      commandKeyBinding: Ace.CommandMap;
    }
  }
}
