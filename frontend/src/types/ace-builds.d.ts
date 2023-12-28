import "ace-builds";

declare module "ace-builds" {
  namespace Ace {
    interface CommandManager {
      // "commandKeyBinding" is not typed, but used in the code, and it works. So, adding an explicit typing here
      commandKeyBinding: Ace.CommandMap;
    }
    interface TextInput {
      getElement(): HTMLTextAreaElement;
    }
    interface Editor {
      completer?: {
        popup?: {
          isOpen: boolean;
        };
      };
    }
    interface EditSession {
      $modeId: string;
      $mode: {
        $behaviour: unknown;
        $highlightRules: {
          $rules: {
            start: { token: string; regex: string; onMatch: null }[];
          };
        };
        $tokenizer?: unknown;

        getTokenizer: () => Tokenizer;
      };

      bgTokenizer: Tokenizer & {
        start: (index: number) => void;
        setTokenizer: (tokenizer: Tokenizer) => void;
      };

      gutterRenderer: {
        getWidth(
          session: Ace.EditSession,
          lastLineNumber: number,
          config: { characterWidth: number },
        ): number;
        getText: (session: Ace.EditSession, row: number) => number;
      };
    }
  }
}
