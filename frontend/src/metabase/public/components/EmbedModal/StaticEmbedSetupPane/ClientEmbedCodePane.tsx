import { t } from "ttag";
import type { ClientCodeSampleConfig } from "metabase/public/lib/types";

import { CodeSample } from "./CodeSample";

import "ace/mode-html";
import "ace/mode-jsx";
import "ace/mode-jade";
import "ace/mode-html_ruby";

interface ClientEmbedCodePaneProps {
  clientCodeOptions: ClientCodeSampleConfig[];
  selectedClientCodeOptionName: string;
  setSelectedClientCodeOptionName: (languageName: string) => void;
  onCopy: () => void;
}

export const ClientEmbedCodePane = ({
  clientCodeOptions,
  selectedClientCodeOptionName,
  setSelectedClientCodeOptionName,
  onCopy,
}: ClientEmbedCodePaneProps): JSX.Element | null => {
  const selectedClientCodeOption = clientCodeOptions.find(
    ({ id }) => id === selectedClientCodeOptionName,
  );

  if (!selectedClientCodeOption) {
    return null;
  }

  return (
    <CodeSample
      dataTestId="embed-frontend"
      title={t`Then insert this code snippet in your HTML template or single page app.`}
      selectedOptionId={selectedClientCodeOptionName}
      languageOptions={clientCodeOptions}
      source={selectedClientCodeOption.source}
      textHighlightMode={selectedClientCodeOption.mode}
      onChangeOption={setSelectedClientCodeOptionName}
      onCopy={onCopy}
    />
  );
};
