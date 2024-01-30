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
}

export const ClientEmbedCodePane = ({
  clientCodeOptions,
  selectedClientCodeOptionName,
  setSelectedClientCodeOptionName,
}: ClientEmbedCodePaneProps): JSX.Element | null => {
  const selectedClientCodeOption = clientCodeOptions.find(
    ({ name }) => name === selectedClientCodeOptionName,
  );

  if (!selectedClientCodeOption) {
    return null;
  }

  return (
    <CodeSample
      dataTestId="embed-frontend"
      title={t`Then insert this code snippet in your HTML template or single page app.`}
      selectedOptionName={selectedClientCodeOptionName}
      languageOptions={clientCodeOptions.map(({ name }) => name)}
      source={selectedClientCodeOption.source}
      textHighlightMode={selectedClientCodeOption.mode}
      onChangeOption={setSelectedClientCodeOptionName}
    />
  );
};
