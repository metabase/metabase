import cx from "classnames";
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
import CS from "metabase/css/core/index.css";
import { EntityName } from "metabase/entities/containers/EntityName";
import { GTAPApi } from "metabase/services";
import type { IconName } from "metabase/ui";
import { Button, Center, Icon, Loader } from "metabase/ui";
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
      <Center p="2rem">
        <Loader data-testid="loading-indicator" />
      </Center>
    );
  }

  return (
    <div>
      <h2
        className={CS.p3}
      >{t`Configure row and column security for this table`}</h2>

      <div>
        <div className={cx(CS.px3, CS.pb3)}>
          {hasSavedQuestionSandboxingFeature ? (
            <div>
              <div className={CS.pb2}>
                {t`When the following rules are applied, this group will see a customized version of the table.`}
              </div>
              <div className={CS.pb4}>
                {t`These rules don’t apply to native queries.`}
              </div>
              <h4
                className={CS.pb1}
              >{t`How do you want to filter this table?`}</h4>
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
            </div>
          ) : (
            <div>
              <div className={CS.pb2}>
                {t`Users in this group will only see rows where the selected column matches their user attribute value.`}
              </div>
              <div>{t`This rule doesn't apply to native queries`}</div>
            </div>
          )}
        </div>
        {shouldUseSavedQuestion && (
          <div className={cx(CS.px3, CS.pb3)}>
            <div className={CS.pb2}>
              {t`Pick a saved question that returns the custom view of this table that these users should see.`}
            </div>
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
          </div>
        )}
        {(!shouldUseSavedQuestion || policy.card_id != null) &&
          (hasAttributesOptions || hasValidMappings ? (
            <div className={cx(CS.p3, CS.borderTop, CS.borderBottom)}>
              {shouldUseSavedQuestion && (
                <div className={CS.pb2}>
                  {t`You can optionally add additional filters here based on user attributes. These filters will be applied on top of any filters that are already in this saved question.`}
                </div>
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
            </div>
          ) : (
            <div className={CS.px3}>
              <AttributeOptionsEmptyState
                title={
                  shouldUseSavedQuestion
                    ? t`To add additional filters, your users need to have some attributes`
                    : t`For this option to work, your users need to have some attributes`
                }
              />
            </div>
          ))}
      </div>

      <div className={CS.p3}>
        {isValid && (
          <div className={CS.pb1}>
            <PolicySummary
              policy={normalizedPolicy}
              policyTable={policyTable}
            />
          </div>
        )}

        <div className={cx(CS.flex, CS.alignCenter, CS.justifyEnd)}>
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <ActionButton
            className={CS.ml1}
            actionFn={savePolicy}
            primary
            disabled={!canSave}
          >
            {t`Save`}
          </ActionButton>
        </div>
        {error && (
          <div className={cx(CS.flex, CS.alignCenter, CS.my2, CS.textError)}>
            {typeof error === "string"
              ? error
              : // @ts-expect-error provide correct type for error
                (error.data.message ?? ERROR_MESSAGE)}
          </div>
        )}
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditSandboxingModal;

interface SummaryRowProps {
  icon: IconName;
  content: React.ReactNode;
}

const SummaryRow = ({ icon, content }: SummaryRowProps) => (
  <div className={cx(CS.flex, CS.alignCenter)}>
    <Icon className={CS.p1} name={icon} />
    <span>{content}</span>
  </div>
);

interface PolicySummaryProps {
  policy: GroupTableAccessPolicy;
  policyTable: Table | undefined;
}

const PolicySummary = ({ policy, policyTable }: PolicySummaryProps) => {
  const headingId = _.uniqueId();
  return (
    <div aria-labelledby={headingId}>
      <div
        id={headingId}
        className={cx(CS.px1, CS.pb2, CS.textUppercase, CS.textSmall)}
      >
        {t`Summary`}
      </div>
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
                  <EntityName entityType="tables" entityId={policy.table_id} />
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
                    <span key="attr" className={CS.textCode}>
                      {attribute}
                    </span>
                  )}`
                : jt`and ${(
                    <TargetName
                      key="target"
                      policy={policy}
                      policyTable={policyTable}
                      target={target}
                    />
                  )} equals ${(
                    <span key="attr" className={CS.textCode}>
                      {attribute}
                    </span>
                  )}`
            }
          />
        ),
      )}
    </div>
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
