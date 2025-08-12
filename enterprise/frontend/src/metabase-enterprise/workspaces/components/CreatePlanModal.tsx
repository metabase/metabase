import { useCallback, useState } from "react";
import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { Button, Modal, Stack, TextInput, Textarea } from "metabase/ui";

interface CreatePlanModalProps {
  workspaceId: number;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormValues {
  title: string;
  description?: string;
  content: string;
}

export function CreatePlanModal({
  workspaceId,
  opened,
  onClose,
  onSuccess,
}: CreatePlanModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      setIsLoading(true);
      try {
        // Parse the YAML content to validate it
        let contentObject;
        try {
          // Simple validation - try to parse as JSON first, then assume it's valid YAML
          if (values.content.trim().startsWith("{")) {
            contentObject = JSON.parse(values.content);
          } else {
            // For now, just wrap the YAML content in a simple structure
            // In a real implementation, you'd use a proper YAML parser
            contentObject = { yaml: values.content };
          }
        } catch (error) {
          alert(t`Invalid YAML/JSON content. Please check your syntax.`);
          return;
        }

        const response = await fetch(`/api/ee/workspace/${workspaceId}/plan`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: values.title,
            description: values.description,
            content: contentObject,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create plan");
        }

        onSuccess?.();
        onClose();
      } catch (error) {
        console.error("Failed to create plan:", error);
        alert(t`Failed to create plan. Please try again.`);
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId, onSuccess, onClose],
  );

  return (
    <Modal title={t`Create Plan`} opened={opened} onClose={onClose} size="lg">
      <FormProvider
        initialValues={{
          title: "",
          description: "",
          content: `# Example Plan
name: "My Plan"
steps:
  - step1: "Define requirements"
  - step2: "Design solution"
  - step3: "Implement and test"
goals:
  - "Improve data quality"
  - "Reduce processing time"`,
        }}
        onSubmit={handleSubmit}
      >
        {({ values, setFieldValue }) => (
          <Form>
            <Stack gap="md">
              <TextInput
                label={t`Title`}
                placeholder={t`Enter plan title`}
                value={values.title}
                onChange={(e) => setFieldValue("title", e.target.value)}
                required
                data-testid="plan-title-input"
              />
              <Textarea
                label={t`Description`}
                placeholder={t`Enter plan description (optional)`}
                value={values.description}
                onChange={(e) => setFieldValue("description", e.target.value)}
                minRows={2}
                data-testid="plan-description-input"
              />
              <Textarea
                label={t`YAML Content`}
                placeholder={t`Enter your plan as YAML`}
                value={values.content}
                onChange={(e) => setFieldValue("content", e.target.value)}
                minRows={10}
                required
                data-testid="plan-content-input"
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
                    loading={isLoading}
                    disabled={!values.title.trim() || !values.content.trim()}
                  >
                    {t`Create Plan`}
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
