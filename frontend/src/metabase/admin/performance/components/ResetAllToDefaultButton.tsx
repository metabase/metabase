import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { CacheConfigApi } from "metabase/services";
import { Flex, Text } from "metabase/ui";

import type { Config } from "../types";

export const ResetAllToDefaultButton = ({
  configs,
  setConfigs,
}: {
  configs: Config[];
  setConfigs: Dispatch<SetStateAction<Config[]>>;
}) => {
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
    <FormProvider initialValues={{}} onSubmit={resetAllToDefault}>
      <Form>
        <Flex justify="flex-end">
          <FormSubmitButton
            label={
              <Text
                fw="normal"
                color="error"
                // TODO: Add confirmation modal?
              >{t`Reset all to default`}</Text>
            }
            variant="subtle"
          />
        </Flex>
      </Form>
    </FormProvider>
  );
};
