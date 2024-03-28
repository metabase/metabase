import { useFormikContext } from "formik";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { CacheConfigApi } from "metabase/services";
import { Flex, Group, Icon, Text } from "metabase/ui";

import { rootId } from "../constants";
import { Strategies, type Config } from "../types";

export const ResetAllToDefaultButton = ({
  configs,
  setConfigs,
}: {
  configs: Config[];
  setConfigs: Dispatch<SetStateAction<Config[]>>;
}) => {
  const rootConfig = findWhere(configs, { model_id: rootId });

  const resetAllToDefault = useCallback(async () => {
    // TODO: Add confirmation
    const originalConfigs = [...configs];
    setConfigs((configs: Config[]) =>
      configs.filter(({ model }) => model !== "database"),
    );

    const ids = configs.reduce<number[]>(
      (acc, config) =>
        config.model === "database" ? [...acc, config.model_id] : acc,
      [],
    );

    if (ids.length === 0) {
      return;
    }

    await CacheConfigApi.delete(
      { model_id: ids, model: "database" },
      { hasBody: true },
    ).catch(async () => {
      setConfigs(originalConfigs);
    });
  }, [configs, setConfigs]);

  return (
    <>
      <FormProvider initialValues={{}} onSubmit={resetAllToDefault}>
        <ResetAllToDefaultButtonFormBody
          rootConfig={rootConfig}
          setConfigs={setConfigs}
        />
      </FormProvider>
    </>
  );
};

const ResetAllToDefaultButtonFormBody = ({
  rootConfig,
}: {
  rootConfig: Config | undefined;
  setConfigs: Dispatch<SetStateAction<Config[]>>;
}) => {
  const { submitForm } = useFormikContext();
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const rootConfigLabel = rootConfig?.strategy.type
    ? Strategies[rootConfig?.strategy.type].shortLabel
    : "default";

  const confirmResetAllToDefault = () => {
    askConfirmation({
      title: t`Reset all database caching policies to ${rootConfigLabel}?`,
      message: "",
      confirmButtonText: t`Reset`,
      onConfirm: submitForm,
    });
  };

  return (
    <>
      <Form>
        <Flex justify="flex-end">
          <FormSubmitButton
            onClick={e => {
              confirmResetAllToDefault();
              e.preventDefault();
              return false;
            }}
            label={
              <Text
                fw="normal"
                color="error"
                // TODO: Add confirmation modal?
              >{t`Reset all to default`}</Text>
            }
            successLabel={
              <Text fw="bold" color="success">
                <Group spacing="xs">
                  <Icon name="check" /> {t`Success`}
                </Group>
              </Text>
            }
            variant="subtle"
          />
        </Flex>
      </Form>
      {confirmationModal}
    </>
  );
};
