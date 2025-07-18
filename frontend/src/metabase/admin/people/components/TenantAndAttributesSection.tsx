import { useState } from "react";
import { t } from "ttag";

import {
  Accordion,
  ActionIcon,
  Box,
  Button,
  Group,
  HoverCard,
  Stack,
  Text,
  TextInput,
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
  { key: "tenant_slug", value: "acme-corp-2024", type: "readonly" },
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
    <Box mt="xl" mb="xl">
      <Accordion>
        <Accordion.Item value="attributes">
          <Accordion.Control>
            <Text fw={600}>{t`Attributes`}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs" mt="md">
              {/* Tenant Properties */}
              {tenantProperties.map((property, index) => (
                <Group key={`tenant-${index}`} gap="md" align="center" wrap="nowrap">
                  <Box style={{ width: '50%' }}>
                    <Group gap="xs" align="center">
                      <Text fw={500} size="sm" style={{ paddingLeft: '12px' }}>
                        {property.key}
                      </Text>
                      <HoverCard width={280} shadow="md">
                        <HoverCard.Target>
                          <ActionIcon size="xs" variant="subtle" color="gray">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                            </svg>
                          </ActionIcon>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                          <Box p="md">
                            <Text size="sm" style={{ wordWrap: 'break-word', hyphens: 'auto' }}>
                              {t`This value is automatically set from your tenant configuration and cannot be modified.`}
                            </Text>
                          </Box>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    </Group>
                  </Box>
                  <Box style={{ width: '50%' }}>
                    <TextInput
                      size="sm"
                      value={property.value}
                      disabled
                      style={{ width: '100%' }}
                    />
                  </Box>
                </Group>
              ))}

              {/* Inherited Attributes */}
              {inheritedAttributes.map((attribute, index) => (
                <Group key={`inherited-${index}`} gap="md" align="center" wrap="nowrap">
                  <Box style={{ width: '50%' }}>
                    <Text fw={500} size="sm" style={{ paddingLeft: '12px' }}>
                      {attribute.key}
                    </Text>
                  </Box>
                  <Box style={{ width: '50%' }}>
                    <TextInput
                      size="sm"
                      value={attribute.value}
                      onChange={(e) => handleInheritedAttributeChange(index, e.target.value)}
                      style={{ width: '100%' }}
                      variant={attribute.isModified ? "filled" : "default"}
                      rightSection={
                        attribute.isModified ? (
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
                        ) : undefined
                      }
                    />
                  </Box>
                </Group>
              ))}

              {/* Custom Attributes */}
              {customAttributes.map((attribute, index) => (
                <Group key={`custom-${index}`} gap="md" align="center" wrap="nowrap">
                  <Box style={{ width: '50%' }}>
                    <TextInput
                      size="sm"
                      value={attribute.key}
                      onChange={(e) => handleCustomAttributeChange(index, 'key', e.target.value)}
                      placeholder={t`Key`}
                      style={{ width: '100%' }}
                    />
                  </Box>
                  <Box style={{ width: '50%' }}>
                    <Group gap="xs" align="center" wrap="nowrap">
                      <TextInput
                        size="sm"
                        value={attribute.value}
                        onChange={(e) => handleCustomAttributeChange(index, 'value', e.target.value)}
                        placeholder={t`Value`}
                        style={{ flex: 1 }}
                      />
                      <Box
                        style={{
                          width: 32,
                          height: 32,
                          border: '1px solid var(--mb-color-border)',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
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
                  </Box>
                </Group>
              ))}

              {/* Add new custom attribute */}
              <Group justify="flex-start" mt="sm">
                <Box style={{ width: '50%' }} />
                <Box style={{ width: '50%' }}>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={handleAddCustomAttribute}
                  >
                    {t`+ Add Attribute`}
                  </Button>
                </Box>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Box>
  );
};
