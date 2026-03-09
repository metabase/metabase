import { useCallback, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import type { DataSegregationStrategy } from "metabase/embedding/embedding-hub";
import { slugify } from "metabase/lib/formatting";
import type { CreatedTenantData } from "metabase/plugins/oss/tenants";
import {
  Button,
  Flex,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { useCreateTenantMutation } from "../../../api/tenants";

import S from "./CreateTenantsOnboardingStep.module.css";
import { TenantIdentifierInput } from "./TenantIdentifierInput";
import { getIsolationFieldConfig } from "./isolation-field-config";

export const CreateTenantsOnboardingStep = ({
  onTenantsCreated,
  selectedFieldIds,
  strategy,
  rlsColumnName,
}: {
  onTenantsCreated?: (tenants: CreatedTenantData[]) => void;
  selectedFieldIds?: FieldId[];
  strategy?: DataSegregationStrategy | null;
  rlsColumnName?: string | null;
}) => {
  const [sendToast] = useToast();

  const [createTenant, { isLoading }] = useCreateTenantMutation();

  const [tenants, setTenants] = useState<CreatedTenantData[]>([
    createEmptyTenant(1),
  ]);

  const addTenantCard = useCallback(() => {
    setTenants((prev) => [...prev, createEmptyTenant(prev.length + 1)]);
  }, []);

  const updateTenantCard = useCallback(
    (index: number, field: keyof CreatedTenantData, value: string) => {
      setTenants((prev) =>
        prev.map((tenant, i) => {
          if (i !== index) {
            return tenant;
          }

          const updated = { ...tenant, [field]: value };

          // re-generate slug when name changes
          if (field === "name") {
            updated.slug = slugify(value).replaceAll("_", "-");
          }

          return updated;
        }),
      );
    },
    [],
  );

  const removeTenantCard = useCallback((index: number) => {
    setTenants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const fieldConfig = getIsolationFieldConfig(strategy);

  const handleCreateTenants = useCallback(async () => {
    try {
      // Create all tenants sequentially
      for (const tenant of tenants) {
        const attributes =
          fieldConfig && tenant.dataIsolationFieldValue
            ? { [fieldConfig.attributeKey]: tenant.dataIsolationFieldValue }
            : {};

        await createTenant({
          name: tenant.name,
          slug: tenant.slug,
          attributes,
        }).unwrap();
      }

      sendToast({
        icon: "check",
        toastColor: "success",
        message: t`Tenants created successfully`,
      });

      // Pass the created tenants to the parent
      onTenantsCreated?.(tenants);
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(error, t`Failed to create tenants`),
      });
    }
  }, [tenants, fieldConfig, createTenant, sendToast, onTenantsCreated]);

  const isValid = tenants.every(
    (tenant) =>
      tenant.name.trim() &&
      tenant.slug.trim() &&
      tenant.dataIsolationFieldValue.trim(),
  );

  return (
    <Stack gap="md">
      <Stack gap="md">
        {tenants.map((tenant, index) => (
          <Paper key={index} withBorder p="md" radius="md">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <TextInput
                  value={tenant.name}
                  onChange={(e) =>
                    updateTenantCard(index, "name", e.target.value)
                  }
                  placeholder={t`Tenant name`}
                  flex={1}
                  fw="bold"
                  classNames={{ input: S.TenantNameInput }}
                />
                {tenants.length > 1 && (
                  <Button
                    variant="subtle"
                    color="text-secondary"
                    p={0}
                    onClick={() => removeTenantCard(index)}
                    aria-label={t`Remove tenant`}
                  >
                    <Icon name="close" size={16} />
                  </Button>
                )}
              </Group>

              <TenantFormField
                label={t`Tenant slug`}
                description={t`Can't be changed later. Used to reference tenants via API and SSO.`}
                value={tenant.slug}
                onChange={(value) => updateTenantCard(index, "slug", value)}
                placeholder="tenant-slug"
              />

              {strategy === "row-column-level-security" && (
                <TenantIdentifierInput
                  value={tenant.dataIsolationFieldValue}
                  onChange={(value) =>
                    updateTenantCard(index, "dataIsolationFieldValue", value)
                  }
                  selectedFieldIds={selectedFieldIds}
                  columnName={rlsColumnName}
                />
              )}

              {(strategy === "connection-impersonation" ||
                strategy === "database-routing") &&
                fieldConfig && (
                  <TenantFormField
                    label={fieldConfig.label}
                    description={fieldConfig.description}
                    value={tenant.dataIsolationFieldValue}
                    onChange={(value) =>
                      updateTenantCard(index, "dataIsolationFieldValue", value)
                    }
                    placeholder={fieldConfig.placeholder}
                  />
                )}
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Flex justify="space-between" align="center">
        <Button
          variant="subtle"
          leftSection={<Icon name="add" size={16} />}
          onClick={addTenantCard}
          p={0}
          fw="bold"
        >
          {t`New tenant`}
        </Button>

        <Button
          variant="filled"
          onClick={handleCreateTenants}
          loading={isLoading}
          disabled={!isValid}
        >
          {t`Create tenants`}
        </Button>
      </Flex>
    </Stack>
  );
};

const TenantFormField = ({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <Stack gap="xs">
    <Text fw="bold" size="sm">
      {label}
    </Text>

    <Text c="text-secondary" size="xs" mb="sm">
      {description}
    </Text>

    <TextInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </Stack>
);

const createEmptyTenant = (index: number): CreatedTenantData => ({
  name: `Tenant ${index}`,
  dataIsolationFieldValue: "",
  slug: `tenant-${index}`,
});
