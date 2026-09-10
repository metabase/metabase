import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { isProduction } from "metabase/env";
import {
  Form,
  FormMultiSelect,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useNavigate } from "metabase/router";
import {
  Alert,
  Button,
  Group,
  Icon,
  Modal,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import { trackMetricCubeViewerSettingsApplied } from "../../analytics";
import { useMetricCubeViewerContext } from "../../context";
import { CARD_GENERATORS, DEFAULT_CARD_GENERATOR_ID } from "../../generators";
import { useResetViewerConfirmation } from "../../hooks/use-reset-viewer-confirmation";

import {
  type SettingsFormValues,
  getDimensionOptionGroups,
  getMeasureOptions,
  getSettingsValidationSchema,
  toCoarseSettings,
  toSettingsFormValues,
} from "./utils";

export interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { catalog, state, actions, generator } = useMetricCubeViewerContext();
  const isFineMode = state.mode === "fine";
  const { confirmReset, modalContent } = useResetViewerConfirmation(onClose);

  const initialValues = useMemo(
    () => toSettingsFormValues(state.settings),
    [state.settings],
  );
  const validationSchema = useMemo(() => getSettingsValidationSchema(), []);
  const measureOptions = useMemo(() => getMeasureOptions(catalog), [catalog]);
  const dimensionOptions = useMemo(
    () => getDimensionOptionGroups(catalog.dimensions),
    [catalog.dimensions],
  );
  const filterDimensionOptions = useMemo(
    () =>
      getDimensionOptionGroups(
        catalog.dimensions.filter((dimension) => dimension.type !== "numeric"),
      ),
    [catalog.dimensions],
  );

  const handleSubmit = (values: SettingsFormValues) => {
    const settings = toCoarseSettings(values, catalog);
    if (!_.isEqual(settings, state.settings)) {
      actions.applyCoarseSettings(settings);
      trackMetricCubeViewerSettingsApplied(generator.id);
    }
    onClose();
  };

  return (
    <>
      <Modal opened title={t`Viewer settings`} padding="xxl" onClose={onClose}>
        <FormProvider
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          <Form>
            <Stack gap="lg" mt="sm">
              {isFineMode && (
                <Alert color="warning" icon={<Icon name="info" />}>
                  <Stack gap="sm" align="flex-start">
                    <Text>
                      {t`You've edited cards directly. Reset the viewer to use these settings again.`}
                    </Text>
                    <Button
                      variant="default"
                      size="compact-md"
                      onClick={confirmReset}
                    >
                      {t`Reset viewer`}
                    </Button>
                  </Stack>
                </Alert>
              )}
              <FormMultiSelect
                name="measureIds"
                label={t`Measures to display`}
                data={measureOptions}
                searchable
                disabled={isFineMode}
              />
              <FormMultiSelect
                name="dimensionKeys"
                label={t`Dimensions to display`}
                data={dimensionOptions}
                searchable
                disabled={isFineMode}
              />
              <FormMultiSelect
                name="filterDimensionKeys"
                label={t`Dimensions to filter on`}
                data={filterDimensionOptions}
                searchable
                disabled={isFineMode}
              />
              {!isProduction && <GeneratorSelect />}
              <Group justify="flex-end">
                <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  label={t`Apply`}
                  variant="filled"
                  disabled={isFineMode}
                />
              </Group>
            </Stack>
          </Form>
        </FormProvider>
      </Modal>
      {modalContent}
    </>
  );
}

/** Development builds only: switches the `?generator=` URL param. */
function GeneratorSelect() {
  const { catalog, generator } = useMetricCubeViewerContext();
  const navigate = useNavigate();

  const options = CARD_GENERATORS.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
  }));

  return (
    <Select
      label={t`Card generator (development only)`}
      data={options}
      value={generator.id}
      allowDeselect={false}
      onChange={(generatorId) => {
        if (generatorId != null && generatorId !== generator.id) {
          navigate(
            Urls.metricCubeViewer(
              catalog.tableId,
              generatorId === DEFAULT_CARD_GENERATOR_ID
                ? undefined
                : generatorId,
            ),
            { replace: true },
          );
        }
      }}
    />
  );
}
