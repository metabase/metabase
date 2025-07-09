import { useMemo } from "react";
import { t } from "ttag";

import { Form, FormProvider, FormTextInput } from "metabase/forms";
import { Box, Button, Modal, Stack } from "metabase/ui";

import type { DataApp, DataAppEditSettings } from "../types";

interface DataAppEditSettingsModalProps {
  dataApp: DataApp;
  opened: boolean;
  onSubmit: (newSettings: DataAppEditSettings) => void;
  onClose: () => void;
}

export const DataAppEditSettingsModal = ({
  dataApp,
  opened,
  onSubmit,
  onClose,
}: DataAppEditSettingsModalProps) => {
  const initialValues = useMemo(() => {
    const settings: DataAppEditSettings = {
      name: dataApp.name,
      url: dataApp.url,
    };

    return settings;
  }, [dataApp]);

  return (
    <Modal opened={opened} title={t`Data App Settings`} onClose={onClose}>
      <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
        <Form as={Stack}>
          <FormTextInput label={t`Name`} name="name" required />

          <FormTextInput label={t`Url slug`} name="url" required />

          <Box>
            <Button variant="filled" type="submit">{t`Save`}</Button>
          </Box>
        </Form>
      </FormProvider>
    </Modal>
  );
};
