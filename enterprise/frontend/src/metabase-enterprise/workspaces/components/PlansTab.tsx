import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import { type Plan, useDeletePlanMutation } from "metabase-enterprise/api";

import { CreatePlanModal } from "./CreatePlanModal";
import { EditPlanModal } from "./EditPlanModal";

interface PlansTabProps {
  workspaceId: number;
  plans?: Plan[];
  onRefresh?: () => void;
}

export function PlansTab({
  workspaceId,
  plans = [],
  onRefresh,
}: PlansTabProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedPlans, setExpandedPlans] = useState<Set<number>>(new Set());
  const [editingPlan, setEditingPlan] = useState<{
    plan: Plan;
    index: number;
  } | null>(null);
  const [deletePlan] = useDeletePlanMutation();

  const handleSuccess = useCallback(() => {
    setShowCreateModal(false);
    onRefresh?.();
  }, [onRefresh]);

  const handleEditSuccess = useCallback(() => {
    setEditingPlan(null);
    onRefresh?.();
  }, [onRefresh]);

  const handleEditPlan = useCallback((plan: Plan, index: number) => {
    setEditingPlan({ plan, index });
  }, []);

  const handleDeletePlan = useCallback(
    async (index: number) => {
      if (!window.confirm(t`Are you sure you want to delete this plan?`)) {
        return;
      }

      try {
        await deletePlan({ workspaceId, planIndex: index }).unwrap();
        onRefresh?.();
      } catch (error) {
        console.error("Failed to delete plan:", error);
        alert(t`Failed to delete plan. Please try again.`);
      }
    },
    [workspaceId, deletePlan, onRefresh],
  );

  const togglePlan = useCallback((index: number) => {
    setExpandedPlans((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const formatContent = (content: any): string => {
    if (typeof content === "string") {
      return content;
    }

    if (content?.yaml) {
      return content.yaml;
    }

    return JSON.stringify(content, null, 2);
  };

  return (
    <>
      <Stack gap="md">
        <Group justify="apart">
          <Text fw={500}>{t`Plans`}</Text>
          <Button
            variant="light"
            size="xs"
            onClick={() => setShowCreateModal(true)}
          >
            {t`Add Plan`}
          </Button>
        </Group>

        {plans.length > 0 ? (
          <Stack gap="sm">
            {plans.map((plan, index) => {
              const isExpanded = expandedPlans.has(index);
              return (
                <Card key={`${index}-${plan.title}`} p="md" withBorder>
                  <Stack gap="sm">
                    <Group justify="apart" align="flex-start">
                      <Stack gap="xs" style={{ flex: 1 }}>
                        <Group align="center" gap="sm">
                          <Text fw={500} size="lg">
                            {plan.title}
                          </Text>
                          <Badge variant="light" size="sm">
                            {t`Plan`}
                          </Badge>
                        </Group>
                        {plan.description && (
                          <Text size="sm" c="dimmed">
                            {plan.description}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {t`Created: ${new Date(plan.created_at).toLocaleDateString()}`}
                        </Text>
                      </Stack>
                      <Group gap="xs">
                        <ActionIcon
                          variant="subtle"
                          onClick={() => handleEditPlan(plan, index)}
                          aria-label={t`Edit plan`}
                        >
                          <Icon name="pencil" size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => handleDeletePlan(index)}
                          aria-label={t`Delete plan`}
                        >
                          <Icon name="trash" size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          onClick={() => togglePlan(index)}
                          aria-label={isExpanded ? t`Collapse` : t`Expand`}
                        >
                          <Icon
                            name={isExpanded ? "chevronup" : "chevrondown"}
                            size={16}
                          />
                        </ActionIcon>
                      </Group>
                    </Group>

                    <Collapse in={isExpanded}>
                      <Stack gap="sm">
                        <Text size="sm" fw={500}>{t`YAML Content:`}</Text>
                        <Code
                          block
                          style={{
                            maxHeight: "400px",
                            overflow: "auto",
                            fontSize: "12px",
                            fontFamily:
                              'Monaco, Menlo, "Ubuntu Mono", monospace',
                          }}
                        >
                          {formatContent(plan.content)}
                        </Code>
                      </Stack>
                    </Collapse>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Card p="xl" withBorder>
            <Stack align="center" gap="md">
              <Text c="dimmed">{t`No plans yet`}</Text>
              <Button variant="light" onClick={() => setShowCreateModal(true)}>
                {t`Create your first plan`}
              </Button>
            </Stack>
          </Card>
        )}
      </Stack>

      <CreatePlanModal
        workspaceId={workspaceId}
        opened={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleSuccess}
      />

      {editingPlan && (
        <EditPlanModal
          workspaceId={workspaceId}
          plan={editingPlan.plan}
          planIndex={editingPlan.index}
          opened={!!editingPlan}
          onClose={() => setEditingPlan(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}
