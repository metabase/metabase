import { t } from "ttag";

import type { ClientCodeSampleConfig } from "metabase/public/lib/types";

import { CodeSample } from "./CodeSample";

import "ace/mode-html";
import "ace/mode-jsx";
import "ace/mode-jade";
import "ace/mode-html_ruby";

interface ClientEmbedCodePaneProps {
  clientCodeOptions: ClientCodeSampleConfig[];
  selectedClientCodeOptionId: string;
  setSelectedClientCodeOptionId: (languageName: string) => void;
  onCopy: () => void;
}

export const ClientEmbedCodePane = ({
  clientCodeOptions,
  selectedClientCodeOptionId,
  setSelectedClientCodeOptionId,
  onCopy,
}: ClientEmbedCodePaneProps): JSX.Element | null => {
  const selectedClientCodeOption = clientCodeOptions.find(
    ({ id }) => id === selectedClientCodeOptionId,
  );

  if (!selectedClientCodeOption) {
    return null;
  }

  return (
    <CodeSample
      dataTestId="embed-frontend"
      title={t`Then insert this code snippet in your HTML template or single page app.`}
      selectedOptionId={selectedClientCodeOptionId}
      languageOptions={clientCodeOptions}
      source={selectedClientCodeOption.source}
      textHighlightMode={selectedClientCodeOption.mode}
      onChangeOption={setSelectedClientCodeOptionId}
      onCopy={onCopy}
    />
  );
};
