import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";

import { EmbeddingSettingsPageView } from "../EmbeddingSettingsPageView";
import { EmbeddingSettingsSwitch } from "../EmbeddingSettingsSwitch";

import { CorsOriginInput } from "./CorsOriginInput";
import { DocumentationCta } from "./DocumentationCta";
import { GetStarted } from "./GetStarted";
import { SdkInfoAlert } from "./SdkInfoAlert";
import { VersionPinning } from "./VersionPinning";

export const EmbeddingSdkSettings = () => {
  const isEE = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isHosted = useSetting("is-hosted?");

  return (
    <EmbeddingSettingsPageView
      breadcrumbs={[
        [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
        [t`Embedding SDK for React`],
      ]}
    >
      <EmbeddingSettingsSwitch
        settingKey={"enable-embedding-sdk"}
        switchLabel={t`Enable Embedded analytics SDK`}
      />
      <SdkInfoAlert />
      <GetStarted />
      <CorsOriginInput />
      {isEE && isHosted && <VersionPinning />}
      <DocumentationCta />
    </EmbeddingSettingsPageView>
  );
};
