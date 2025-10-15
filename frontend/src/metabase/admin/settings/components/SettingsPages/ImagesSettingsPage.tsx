import { jt, t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";

import { AdminSettingInput } from "../widgets/AdminSettingInput";

export function ImagesSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Images`}>
      <AdminSettingInput
        name="image-upload-s3-bucket"
        title={t`S3 Bucket URL`}
        inputType="text"
      />
      <AdminSettingInput
        name="image-upload-aws-access-key-id"
        title={t`AWS Access Key ID`}
        inputType="text"
      />
      <AdminSettingInput
        name="image-upload-aws-secret-access-key"
        title={t`AWS Secret Access Key`}
        inputType="password"
      />
    </SettingsPageWrapper>
  );
}
