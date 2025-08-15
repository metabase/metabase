import { useCallback } from "react";
import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { Button, Modal, Stack, TextInput, Textarea } from "metabase/ui";

interface CreateTransformModalProps {
  workspaceId: number;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormValues {
  name: string;
  description: string;
  source: string;
  target: string;
  config?: string;
}

export function CreateTransformModal({
  workspaceId,
  opened,
  onClose,
  onSuccess,
}: CreateTransformModalProps) {
  const initialValues: FormValues = {
    name: "",
    description: "",
    source: "",
    target: "",
    config: "",
  };

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      try {
        // Just wrap the text blobs in objects
        const sourceObject = { data: values.source };
        const targetObject = { data: values.target };
        const configObject = values.config
          ? { data: values.config }
          : undefined;

        const response = await fetch(
          `/api/ee/workspace/${workspaceId}/transform`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: values.name,
              description: values.description,
              source: sourceObject,
              target: targetObject,
              config: configObject,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to create transform");
        }

        onSuccess?.();
        onClose();
      } catch (error) {
        console.error("Failed to create transform:", error);
        alert(t`Failed to create transform. Please try again.`);
      }
    },
    [workspaceId, onSuccess, onClose],
  );

  return (
    <Modal
      title={t`Create Transform`}
      opened={opened}
      onClose={onClose}
      size="lg"
    >
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
        {({ values, setFieldValue }) => (
          <Form>
            <Stack gap="md">
              <TextInput
                label={t`Name`}
                placeholder={t`Enter transform name`}
                value={values.name}
                onChange={(e) => setFieldValue("name", e.target.value)}
                required
                data-testid="transform-name-input"
              />
              <Textarea
                label={t`Description`}
                placeholder={t`Enter transform description`}
                value={values.description}
                onChange={(e) => setFieldValue("description", e.target.value)}
                minRows={2}
                required
                data-testid="transform-description-input"
              />
              <Textarea
                label={t`Source Configuration`}
                placeholder={t`Enter source configuration`}
                value={values.source}
                onChange={(e) => setFieldValue("source", e.target.value)}
                minRows={4}
                required
                data-testid="transform-source-input"
                style={{
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                }}
              />
              <Textarea
                label={t`Target Configuration`}
                placeholder={t`Enter target configuration`}
                value={values.target}
                onChange={(e) => setFieldValue("target", e.target.value)}
                minRows={4}
                required
                data-testid="transform-target-input"
                style={{
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                }}
              />
              <Textarea
                label={t`Config (Optional)`}
                placeholder={t`Enter additional configuration (optional)`}
                value={values.config}
                onChange={(e) => setFieldValue("config", e.target.value)}
                minRows={3}
                data-testid="transform-config-input"
                style={{
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                }}
              />
              <Stack gap="sm" align="flex-end">
                <Button.Group>
                  <Button variant="outline" onClick={onClose}>
                    {t`Cancel`}
                  </Button>
                  <Button
                    type="submit"
                    variant="filled"
                    disabled={
                      !values.name.trim() ||
                      !values.description.trim() ||
                      !values.source.trim() ||
                      !values.target.trim()
                    }
                  >
                    {t`Create Transform`}
                  </Button>
                </Button.Group>
              </Stack>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
}
