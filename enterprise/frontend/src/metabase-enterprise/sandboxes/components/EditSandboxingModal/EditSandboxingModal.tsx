import type * as React from "react";
import { useState } from "react";
import { useAsyncFn } from "react-use";
import { c, jt, t } from "ttag";
import _ from "underscore";

import { skipToken, useGetCardQuery, useGetTableQuery } from "metabase/api";
import { ActionButton } from "metabase/common/components/ActionButton";
import {
  QuestionPickerModal,
  getQuestionPickerValue,
} from "metabase/common/components/Pickers/QuestionPicker";
import { QuestionLoader } from "metabase/common/components/QuestionLoader";
import { Radio } from "metabase/common/components/Radio";
import { useToggle } from "metabase/common/hooks/use-toggle";
import { EntityName } from "metabase/entities/containers/EntityName";
import { GTAPApi } from "metabase/services";
import type { IconName } from "metabase/ui";
import {
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import type {
  GroupTableAccessPolicyDraft,
  GroupTableAccessPolicyParams,
} from "metabase-enterprise/sandboxes/types";
import { getRawDataQuestionForTable } from "metabase-enterprise/sandboxes/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  GroupTableAccessPolicy,
  Table,
  UserAttributeKey,
} from "metabase-types/api";

import {
  AttributeOptionsEmptyState,
  DataAttributeMappingEditor,
} from "../AttributeMappingEditor";

// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const ERROR_MESSAGE = t`An error occurred.`;

const getNormalizedPolicy = (
  policy: GroupTableAccessPolicy | GroupTableAccessPolicyDraft,
  shouldUseSavedQuestion: boolean,
): GroupTableAccessPolicy => {
  return {
    ...policy,
    card_id: shouldUseSavedQuestion ? policy.card_id : null,
    attribute_remappings: _.pick(
      policy.attribute_remappings,
      (value, key) => value != null && key != null,
    ),
  } as GroupTableAccessPolicy;
};

const getDraftPolicy = ({
  tableId,
  groupId,
}: GroupTableAccessPolicyParams): GroupTableAccessPolicyDraft => {
  return {
    table_id: parseInt(tableId),
    group_id: parseInt(groupId),
    card_id: null,
    attribute_remappings: { "": null },
  };
};

const isPolicyValid = (
  policy: GroupTableAccessPolicy,
  shouldUseSavedQuestion: boolean,
) => {
  if (shouldUseSavedQuestion) {
    return policy.card_id != null;
  }

  return Object.entries(policy.attribute_remappings).length > 0;
};

export interface EditSandboxingModalProps {
  policy?: GroupTableAccessPolicy;
  attributes: UserAttributeKey[];
  params: GroupTableAccessPolicyParams;
  onCancel: () => void;
  onSave: (policy: GroupTableAccessPolicy) => void;
}

const EditSandboxingModal = ({
  policy: originalPolicy,
  attributes,
  params,
  onCancel,
  onSave,
}: EditSandboxingModalProps) => {
  const [policy, setPolicy] = useState<
    GroupTableAccessPolicy | GroupTableAccessPolicyDraft
  >(originalPolicy ?? getDraftPolicy(params));
  const [shouldUseSavedQuestion, setShouldUseSavedQuestion] = useState(
    policy.card_id != null,
  );

  const normalizedPolicy = getNormalizedPolicy(policy, shouldUseSavedQuestion);
  const isValid = isPolicyValid(normalizedPolicy, shouldUseSavedQuestion);

  const [showPickerModal, { turnOn: showModal, turnOff: hideModal }] =
    useToggle(false);

  const [{ error }, savePolicy] = useAsyncFn(async () => {
    const shouldValidate = normalizedPolicy.card_id != null;
    if (shouldValidate) {
      await GTAPApi.validate(normalizedPolicy);
    }
    onSave(normalizedPolicy);
  }, [normalizedPolicy]);

  const remainingAttributesOptions = attributes.filter(
    (attribute) => !(attribute in policy.attribute_remappings),
  );

  const hasAttributesOptions = attributes.length > 0;
  const hasValidMappings =
    Object.keys(normalizedPolicy.attribute_remappings || {}).length > 0;

  const canSave =
    isValid &&
    (!_.isEqual(originalPolicy, normalizedPolicy) ||
      normalizedPolicy.id == null);

  const { data: policyCard, isFetching: loadingCard } = useGetCardQuery(
    policy.card_id != null ? { id: policy.card_id } : skipToken,
  );
  const { data: policyTable, isFetching: loadingTabe } = useGetTableQuery(
    policy.table_id != null ? { id: policy.table_id } : skipToken,
  );

  const hasSavedQuestionSandboxingFeature = policyTable?.db?.features?.includes(
    "saved-question-sandboxing",
  );

  if (loadingCard || loadingTabe) {
    return (
      <Modal
        opened
        onClose={onCancel}
        title={t`Configure row and column security for this table`}
        size="l"
      >
        <Center p="2rem">
          <Loader data-testid="loading-indicator" />
        </Center>
      </Modal>
    );
  }

  return (
    <Modal
      opened
      onClose={onCancel}
      title={t`Configure row and column security for this table`}
      size="l"
    >
      <Stack gap="lg">
        <Box>
          {hasSavedQuestionSandboxingFeature ? (
            <Stack gap="md">
              <Text>
                {t`When the following rules are applied, this group will see a customized version of the table.`}
              </Text>
              <Text>{t`These rules don't apply to native queries.`}</Text>
              <Text fw="bold" mt="md" mb="xs">
                {t`How do you want to filter this table?`}
              </Text>
              <Radio
                value={!shouldUseSavedQuestion}
                options={[
                  { name: t`Filter by a column in the table`, value: true },
                  {
                    name: t`Use a saved question to create a custom view for this table`,
                    value: false,
                  },
                ]}
                onChange={(shouldUseSavedQuestion) =>
                  setShouldUseSavedQuestion(!shouldUseSavedQuestion)
                }
                vertical
              />
            </Stack>
          ) : (
            <Stack gap="md">
              <Text>
                {t`Users in this group will only see rows where the selected column matches their user attribute value.`}
              </Text>
              <Text>{t`This rule doesn't apply to native queries`}</Text>
            </Stack>
          )}
        </Box>
        {shouldUseSavedQuestion && (
          <Box>
            <Text mb="md">
              {t`Pick a saved question that returns the custom view of this table that these users should see.`}
            </Text>
            <Button
              data-testid="custom-view-picker-button"
              onClick={showModal}
              fullWidth
              rightSection={<Icon name="ellipsis" />}
              styles={{
                inner: {
                  justifyContent: "space-between",
                },
                root: { "&:active": { transform: "none" } },
              }}
            >
              {policyCard?.name ?? t`Select a question`}
            </Button>
            {showPickerModal && (
              <QuestionPickerModal
                value={
                  policyCard && policy.card_id != null
                    ? getQuestionPickerValue(policyCard)
                    : undefined
                }
                onChange={(newCard) => {
                  setPolicy({ ...policy, card_id: newCard.id });
                  hideModal();
                }}
                onClose={hideModal}
                models={["card", "dataset"]}
                namespaces={[null]}
                options={{
                  hasLibrary: false,
                  hasRootCollection: true,
                  hasPersonalCollections: true,
                  hasConfirmButtons: true,
                }}
              />
            )}
          </Box>
        )}
        {(!shouldUseSavedQuestion || policy.card_id != null) &&
          (hasAttributesOptions || hasValidMappings ? (
            <Box>
              <Divider />
              <Box py="md">
                {shouldUseSavedQuestion && (
                  <Text mb="md">
                    {t`You can optionally add additional filters here based on user attributes. These filters will be applied on top of any filters that are already in this saved question.`}
                  </Text>
                )}
                <DataAttributeMappingEditor
                  value={policy.attribute_remappings}
                  policyTable={policyTable}
                  onChange={(attribute_remappings) =>
                    setPolicy({ ...policy, attribute_remappings })
                  }
                  shouldUseSavedQuestion={shouldUseSavedQuestion}
                  policy={policy}
                  attributesOptions={remainingAttributesOptions}
                />
              </Box>
              <Divider />
            </Box>
          ) : (
            <Box>
              <AttributeOptionsEmptyState
                title={
                  shouldUseSavedQuestion
                    ? t`To add additional filters, your users need to have some attributes`
                    : t`For this option to work, your users need to have some attributes`
                }
              />
            </Box>
          ))}

        {isValid && (
          <Box mt="md">
            <PolicySummary
              policy={normalizedPolicy}
              policyTable={policyTable}
            />
          </Box>
        )}

        <Flex justify="flex-end" align="center" gap="sm" mt="lg">
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <ActionButton actionFn={savePolicy} primary disabled={!canSave}>
            {t`Save`}
          </ActionButton>
        </Flex>

        {error && (
          <Flex align="center" mt="md">
            <Text c="error">
              {typeof error === "string"
                ? error
                : // @ts-expect-error provide correct type for error
                  (error.data.message ?? ERROR_MESSAGE)}
            </Text>
          </Flex>
        )}
      </Stack>
    </Modal>
  );
};

export { EditSandboxingModal };

interface SummaryRowProps {
  icon: IconName;
  content: React.ReactNode;
}

const SummaryRow = ({ icon, content }: SummaryRowProps) => (
  <Flex align="center" gap="xs">
    <Icon name={icon} />
    <Text>{content}</Text>
  </Flex>
);

interface PolicySummaryProps {
  policy: GroupTableAccessPolicy;
  policyTable: Table | undefined;
}

const PolicySummary = ({ policy, policyTable }: PolicySummaryProps) => {
  const headingId = _.uniqueId();
  return (
    <Box aria-labelledby={headingId}>
      <Text
        id={headingId}
        size="xs"
        tt="uppercase"
        fw="bold"
        c="text-medium"
        mb="sm"
      >
        {t`Summary`}
      </Text>
      <Stack gap="xs">
        <SummaryRow
          icon="group"
          content={jt`Users in ${(
            <strong key="group-name">
              <EntityName entityType="groups" entityId={policy.group_id} />
            </strong>
          )} can view`}
        />
        <SummaryRow
          icon="table"
          content={
            policy.card_id
              ? jt`rows in the ${(
                  <strong key="question-name">
                    <EntityName
                      entityType="questions"
                      entityId={policy.card_id}
                    />
                  </strong>
                )} question`
              : jt`rows in the ${(
                  <strong key="table-name">
                    <EntityName
                      entityType="tables"
                      entityId={policy.table_id}
                    />
                  </strong>
                )} table`
          }
        />
        {Object.entries(policy.attribute_remappings).map(
          ([attribute, target], index) => (
            <SummaryRow
              key={attribute}
              icon="funnel_outline"
              content={
                index === 0
                  ? jt`where ${(
                      <TargetName
                        key="target"
                        policy={policy}
                        policyTable={policyTable}
                        target={target}
                      />
                    )} equals ${(
                      <Text key="attr" span ff="monospace">
                        {attribute}
                      </Text>
                    )}`
                  : jt`and ${(
                      <TargetName
                        key="target"
                        policy={policy}
                        policyTable={policyTable}
                        target={target}
                      />
                    )} equals ${(
                      <Text key="attr" span ff="monospace">
                        {attribute}
                      </Text>
                    )}`
              }
            />
          ),
        )}
      </Stack>
    </Box>
  );
};

interface TargetNameProps {
  policy: GroupTableAccessPolicy;
  policyTable: Table | undefined;
  target: any[];
}

const TargetName = ({ policy, policyTable, target }: TargetNameProps) => {
  if (Array.isArray(target)) {
    if (
      (target[0] === "variable" || target[0] === "dimension") &&
      target[1][0] === "template-tag"
    ) {
      return (
        <span>
          {c(
            "{0} is a name of a variable being used by row and column security",
          ).jt`${(<strong key="strong">{target[1][1]}</strong>)} variable`}
        </span>
      );
    } else if (target[0] === "dimension") {
      const fieldRef = target[1];

      return (
        <QuestionLoader
          questionHash={undefined}
          questionId={policy.card_id}
          questionObject={
            policy.card_id == null && policyTable
              ? getRawDataQuestionForTable(policyTable)
              : null
          }
          includeSensitiveFields
        >
          {({ question }: { question: Question }) => {
            if (!question) {
              return null;
            }

            const query = question.query();
            const stageIndex = -1;
            const columns = Lib.visibleColumns(query, stageIndex);
            const [index] = Lib.findColumnIndexesFromLegacyRefs(
              query,
              stageIndex,
              columns,
              [fieldRef],
            );
            const column = columns[index];
            if (!column) {
              return null;
            }

            const columnInfo = Lib.displayInfo(query, stageIndex, column);
            return (
              <span>
                {c(
                  "{0} is a name of a field being used by row and column security",
                )
                  .jt`${(<strong key="strong">{columnInfo.displayName}</strong>)} field`}
              </span>
            );
          }}
        </QuestionLoader>
      );
    }
  }
  return <strong>[{t`Unknown target`}]</strong>;
};
