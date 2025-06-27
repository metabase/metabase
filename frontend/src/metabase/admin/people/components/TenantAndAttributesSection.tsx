import { useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "metabase/ui";

interface TenantProperty {
  key: string;
  value: string;
  type: "readonly";
}

interface InheritedAttribute {
  key: string;
  value: string;
  originalValue: string;
  isModified: boolean;
  type: "inherited";
}

interface CustomAttribute {
  key: string;
  value: string;
  type: "custom";
}

type _AttributeItem = TenantProperty | InheritedAttribute | CustomAttribute;

// Sample data for prototype
const initialTenantProperties: TenantProperty[] = [
  { key: "tenant_id", value: "acme-corp-2024", type: "readonly" },
  { key: "tenant_plan", value: "enterprise", type: "readonly" },
  { key: "max_users", value: "500", type: "readonly" },
];

const initialInheritedAttributes: InheritedAttribute[] = [
  {
    key: "department",
    value: "Engineering",
    originalValue: "Engineering",
    isModified: false,
    type: "inherited"
  },
  {
    key: "region",
    value: "North America",
    originalValue: "North America",
    isModified: false,
    type: "inherited"
  },
  {
    key: "cost_center",
    value: "CC-ENG-001",
    originalValue: "CC-ENG-001",
    isModified: false,
    type: "inherited"
  },
];

const initialCustomAttributes: CustomAttribute[] = [
  { key: "employee_id", value: "EMP-12345", type: "custom" },
  { key: "manager_email", value: "jane.smith@acme.com", type: "custom" },
];

export const TenantAndAttributesSection = () => {
  const [tenantProperties] = useState<TenantProperty[]>(initialTenantProperties);
  const [inheritedAttributes, setInheritedAttributes] = useState<InheritedAttribute[]>(
    initialInheritedAttributes
  );
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>(
    initialCustomAttributes
  );

  const handleInheritedAttributeChange = (index: number, newValue: string) => {
    setInheritedAttributes(prev =>
      prev.map((attr, i) =>
        i === index
          ? { ...attr, value: newValue, isModified: newValue !== attr.originalValue }
          : attr
      )
    );
  };

  const handleResetInheritedAttribute = (index: number) => {
    setInheritedAttributes(prev =>
      prev.map((attr, i) =>
        i === index
          ? { ...attr, value: attr.originalValue, isModified: false }
          : attr
      )
    );
  };

  const handleCustomAttributeChange = (index: number, field: 'key' | 'value', newValue: string) => {
    setCustomAttributes(prev =>
      prev.map((attr, i) =>
        i === index ? { ...attr, [field]: newValue } : attr
      )
    );
  };

  const handleRemoveCustomAttribute = (index: number) => {
    setCustomAttributes(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomAttribute = () => {
    setCustomAttributes(prev => [
      ...prev,
      { key: "", value: "", type: "custom" }
    ]);
  };

  return (
    <Box mt="xl">
      <Title order={4} mb="md">
        {t`Tenant Properties & User Attributes`}
      </Title>
      <Box p="lg" style={{ border: "1px solid var(--mb-color-border)", borderRadius: 8 }}>

        {/* Tenant Properties Section */}
        <Box mb="lg">
          <Group justify="space-between" align="center" mb="sm">
            <Text fw={600} size="md">
              {t`Properties`}
            </Text>
          </Group>
          <Stack gap="sm">
            {tenantProperties.map((property, index) => (
              <Group key={index} justify="space-between" align="center">
                <Text fw={500} style={{ minWidth: 120 }}>
                  {property.key}
                </Text>
                <TextInput
                  size="xs"
                  value={property.value}
                  disabled
                  style={{ flex: 1 }}
                />
              </Group>
            ))}
          </Stack>
        </Box>

        <Divider my="md" />

        {/* Inherited Tenant Attributes Section */}
        <Box mb="lg">
          <Group justify="space-between" align="center" mb="sm">
            <Text fw={600} size="md">
              {t`Attributes`}
            </Text>
          </Group>
          <Stack gap="sm">
            {inheritedAttributes.map((attribute, index) => (
              <Group key={index} justify="space-between" align="center">
                <Text fw={500} style={{ minWidth: 120 }}>
                  {attribute.key}
                </Text>
                <Group style={{ flex: 1 }}>
                  <TextInput
                    size="xs"
                    value={attribute.value}
                    onChange={(e) => handleInheritedAttributeChange(index, e.target.value)}
                    style={{ flex: 1 }}
                    variant={attribute.isModified ? "filled" : "default"}
                  />
                  {attribute.isModified && (
                    <Tooltip label={t`Reset to original value: ${attribute.originalValue}`}>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => handleResetInheritedAttribute(index)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.55 15.15 20 13.62 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.45 8.85 4 10.38 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                        </svg>
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        </Box>

        <Divider my="md" />

        {/* Custom User Attributes Section */}
        <Box>
          <Group justify="space-between" align="center" mb="sm">
            <Text fw={600} size="md">
              {t`Custom Attributes`}
            </Text>
          </Group>
          <Stack gap="sm">
            {customAttributes.map((attribute, index) => (
              <Group key={index} justify="space-between" align="center">
                <TextInput
                  size="xs"
                  value={attribute.key}
                  onChange={(e) => handleCustomAttributeChange(index, 'key', e.target.value)}
                  placeholder={t`Key`}
                  style={{ flex: 1 }}
                />
                <TextInput
                  size="xs"
                  value={attribute.value}
                  onChange={(e) => handleCustomAttributeChange(index, 'value', e.target.value)}
                  placeholder={t`Value`}
                  style={{ flex: 1 }}
                />
                <Box style={{
                  width: '32px',
                  height: '32px',
                  border: '1px solid var(--mb-color-border)',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => handleRemoveCustomAttribute(index)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </ActionIcon>
                </Box>
              </Group>
            ))}

            {/* Add new custom attribute */}
            <Group justify="flex-start">
              <Button
                size="xs"
                variant="light"
                onClick={handleAddCustomAttribute}
              >
                {t`+ Add`}
              </Button>
            </Group>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};
