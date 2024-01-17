import { useState } from "react";
import { t } from "ttag";
import { getEmbedClientCodeExampleOptions } from "metabase/public/lib/code";
import { CodeSample } from "./CodeSample";

import "ace/mode-html";
import "ace/mode-jsx";
import "ace/mode-jade";
import "ace/mode-html_ruby";

export const ClientEmbedCodePane = (): JSX.Element | null => {
  const clientCodeOptions = getEmbedClientCodeExampleOptions();

  const [selectedClientCodeOptionName, setSelectedClientCodeOptionName] =
    useState(clientCodeOptions[0].name);

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
