import { t } from "ttag";

import { Flex, Icon, Stack, Text, Title } from "metabase/ui";

import { GroupPreviewInfo } from "../GroupPreviewInfo";
import {
  type AffectingAttribute,
  type PreviewPrincipal,
  useGetAffectingAttributesQuery,
} from "../api";
import { formatList } from "../format-list";
import { getUserCount } from "../principal-sections";
import { AttributeTag } from "../troubleshoot/AttributeBar";

type PrincipalHeaderProps = {
  principal: PreviewPrincipal;
  hint?: string;
};

/** Who is being previewed: their groups and attributes, above a read-only preview grid. */
export function PrincipalHeader({ principal, hint }: PrincipalHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      <Flex align="center" gap="md" wrap="wrap">
        <Title order={2}>
          {getWhoName(principal)}{" "}
          <Text component="span" c="text-secondary" fz="md" fw="normal">
            {t`access from all groups · read-only`}
          </Text>
        </Title>
        {principal.type === "group" && (
          <GroupPreviewInfo
            type="group"
            groupNames={principal.groups.map((group) => group.name)}
            attributeValues="each-member"
          />
        )}
      </Flex>
      <Flex gap="lg" wrap="wrap" c="text-secondary">
        <Text c="text-secondary">{getDetail(principal)}</Text>
        <Flex align="center" gap="xs">
          <Icon name="group" />
          <Text c="text-secondary">
            {principal.groups.map((group) => group.name).join(", ")}
          </Text>
        </Flex>
        <Attributes principal={principal} />
      </Flex>
      {hint && <Text>{hint}</Text>}
    </Stack>
  );
}

/** How a preview names who is previewed, as the bands do: "Sandy Sales", "A member of Sales", "A user of Acme". */
export function getWhoName(principal: PreviewPrincipal): string {
  switch (principal.type) {
    case "user":
      return principal.name;
    case "group":
      return t`A member of ${principal.name}`;
    case "tenant":
      return t`A user of ${principal.name}`;
  }
}

function getDetail(principal: PreviewPrincipal) {
  if (principal.superuser) {
    return t`Admin, with full access to everything`;
  }
  if (principal.type === "group") {
    const otherGroups = principal.groups
      .filter((group) => group.id !== principal.id)
      .map((group) => group.name);
    return otherGroups.length > 0
      ? t`Only in this group and ${formatList(otherGroups)}`
      : t`Only in this group`;
  }
  if (principal.type === "tenant") {
    return getUserCount(principal.member_count ?? 0);
  }
  return principal.detail;
}

/** The same attributes as Troubleshoot's and full screen's attribute bar, as read-only chips. */
function Attributes({ principal }: { principal: PreviewPrincipal }) {
  const { data: attributes = [], isLoading } = useGetAffectingAttributesQuery({
    principal: { type: principal.type, id: principal.id },
  });
  return (
    <Flex align="center" gap="xs" wrap="wrap">
      <Text c="text-secondary">{t`User attributes:`}</Text>
      {!isLoading && attributes.length === 0 && (
        <Text c="text-secondary">{t`No user attributes`}</Text>
      )}
      {attributes.map((attribute) => (
        <AttributeTag
          key={attribute.attribute}
          attribute={attribute.attribute}
          value={getAttributeValue(principal, attribute)}
        />
      ))}
    </Flex>
  );
}

/** A group's preview here uses each member's own values, not the defaults Troubleshoot picks. */
function getAttributeValue(
  principal: PreviewPrincipal,
  attribute: AffectingAttribute,
) {
  if (principal.type === "group") {
    return t`each member's own`;
  }
  return attribute.value ?? t`No value`;
}
