import { useCallback } from "react";
import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { Button, Modal, Stack, TextInput, Textarea } from "metabase/ui";
import { type Plan, useUpdatePlanMutation } from "metabase-enterprise/api";

interface EditPlanModalProps {
  workspaceId: number;
  plan: Plan | null;
  planIndex: number;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormValues {
  title: string;
  description?: string;
  content: string;
}

export function EditPlanModal({
  workspaceId,
  plan,
  planIndex,
  opened,
  onClose,
  onSuccess,
}: EditPlanModalProps) {
  const [updatePlan, { isLoading }] = useUpdatePlanMutation();

  const formatContent = useCallback((content: any): string => {
    if (typeof content === "string") {
      return content;
    }

    if (content?.yaml) {
      return content.yaml;
    }

    return JSON.stringify(content, null, 2);
  }, []);

  // Calculate initial values dynamically based on current plan data
  const getInitialValues = useCallback(
    (): FormValues => ({
      title: plan?.title || "",
      description: plan?.description || "",
      content: plan ? formatContent(plan.content) : "",
    }),
    [plan, formatContent],
  );

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      if (!plan) {
        return;
      }

      try {
        // Parse the YAML content to validate it
        let contentObject;
        try {
          // Simple validation - try to parse as JSON first, then assume it's valid YAML
          if (values.content.trim().startsWith("{")) {
            contentObject = JSON.parse(values.content);
          } else {
            // For now, just wrap the YAML content in a simple structure
            contentObject = { yaml: values.content };
          }
        } catch (error) {
          alert(t`Invalid YAML/JSON content. Please check your syntax.`);
          return;
        }

        await updatePlan({
          workspaceId,
          planIndex,
          title: values.title,
          description: values.description,
          content: contentObject,
        }).unwrap();

        onSuccess?.();
        onClose();
      } catch (error) {
        console.error("Failed to update plan:", error);
        alert(t`Failed to update plan. Please try again.`);
      }
    },
    [updatePlan, workspaceId, planIndex, plan, onSuccess, onClose],
  );

  if (!plan) {
    return null;
  }

  return (
    <Modal title={t`Edit Plan`} opened={opened} onClose={onClose} size="lg">
      <FormProvider
        initialValues={getInitialValues()}
        onSubmit={handleSubmit}
        key={plan?.title + plan?.content} // Force re-render when plan changes
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
                    {t`Update Plan`}
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
