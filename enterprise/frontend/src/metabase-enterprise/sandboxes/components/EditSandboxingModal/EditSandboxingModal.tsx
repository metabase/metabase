import React, { useState } from "react";
import _ from "underscore";
import { jt, t } from "ttag";
import { useAsyncFn } from "react-use";

import QuestionPicker from "metabase/containers/QuestionPicker";
import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import Radio from "metabase/core/components/Radio";
import Icon from "metabase/components/Icon";
import EntityName from "metabase/entities/containers/EntityName";

import QuestionLoader from "metabase/containers/QuestionLoader";
import { GroupTableAccessPolicy, UserAttribute } from "metabase-types/api";
import {
  GroupTableAccessPolicyDraft,
  GroupTableAccessPolicyParams,
} from "metabase-enterprise/sandboxes/types";
import { getRawDataQuestionForTable } from "metabase-enterprise/sandboxes/utils";
import { GTAPApi } from "metabase/services";
import Question from "metabase-lib/Question";
import AttributeMappingEditor, {
  AttributeOptionsEmptyState,
} from "../AttributeMappingEditor";

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
  attributes: UserAttribute[];
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

  const [{ error }, savePolicy] = useAsyncFn(async () => {
    const shouldValidate = normalizedPolicy.card_id != null;
    if (shouldValidate) {
      await GTAPApi.validate(normalizedPolicy);
    }
    onSave(normalizedPolicy);
  }, [normalizedPolicy]);

  const remainingAttributesOptions = attributes.filter(
    attribute => !(attribute in policy.attribute_remappings),
  );

  const hasAttributesOptions = attributes.length > 0;
  const hasValidMappings =
    Object.keys(normalizedPolicy.attribute_remappings || {}).length > 0;

  const canSave =
    isValid &&
    (!_.isEqual(originalPolicy, normalizedPolicy) ||
      normalizedPolicy.id == null);

  return (
    <div>
      <h2 className="p3">{t`Grant sandboxed access to this table`}</h2>

      <div>
        <div className="px3 pb3">
          <div className="pb3">
            {t`When users in this group view this table they'll see a version of it that's filtered by their user attributes, or a custom view of it based on a saved question.`}
          </div>
          <h4 className="pb1">
            {t`How do you want to filter this table for users in this group?`}
          </h4>
          <Radio
            value={!shouldUseSavedQuestion}
            options={[
              { name: t`Filter by a column in the table`, value: true },
              {
                name: t`Use a saved question to create a custom view for this table`,
                value: false,
              },
            ]}
            onChange={shouldUseSavedQuestion =>
              setShouldUseSavedQuestion(!shouldUseSavedQuestion)
            }
            vertical
          />
        </div>
        {shouldUseSavedQuestion && (
          <div className="px3 pb3">
            <div className="pb2">
              {t`Pick a saved question that returns the custom view of this table that these users should see.`}
            </div>
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore */}
            <QuestionPicker
              value={policy.card_id}
              onChange={(card_id: number) => setPolicy({ ...policy, card_id })}
            />
          </div>
        )}
        {(!shouldUseSavedQuestion || policy.card_id != null) &&
          (hasAttributesOptions || hasValidMappings ? (
            <div className="p3 border-top border-bottom">
              {shouldUseSavedQuestion && (
                <div className="pb2">
                  {t`You can optionally add additional filters here based on user attributes. These filters will be applied on top of any filters that are already in this saved question.`}
                </div>
              )}
              <AttributeMappingEditor
                value={policy.attribute_remappings}
                onChange={attribute_remappings =>
                  setPolicy({ ...policy, attribute_remappings })
                }
                shouldUseSavedQuestion={shouldUseSavedQuestion}
                policy={policy}
                attributesOptions={remainingAttributesOptions}
              />
            </div>
          ) : (
            <div className="px3">
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

      <div className="p3">
        {isValid && (
          <div className="pb1">
            <PolicySummary policy={normalizedPolicy} />
          </div>
        )}

        <div className="flex align-center justify-end">
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <ActionButton
            error={error}
            className="ml1"
            actionFn={savePolicy}
            primary
            disabled={!canSave}
          >
            {t`Save`}
          </ActionButton>
        </div>
        {error && (
          <div className="flex align-center my2 text-error">
            {typeof error === "string"
              ? error
              : // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                error.data.message ?? ERROR_MESSAGE}
          </div>
        )}
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditSandboxingModal;

interface SummaryRowProps {
  icon: string;
  content: React.ReactNode;
}

const SummaryRow = ({ icon, content }: SummaryRowProps) => (
  <div className="flex align-center">
    <Icon className="p1" name={icon} />
    <span>{content}</span>
  </div>
);

interface PolicySummaryProps {
  policy: GroupTableAccessPolicy;
}

const PolicySummary = ({ policy }: PolicySummaryProps) => {
  return (
    <div>
      <div className="px1 pb2 text-uppercase text-small text-grey-4">
        {t`Summary`}
      </div>
      <SummaryRow
        icon="group"
        content={jt`Users in ${(
          <strong>
            <EntityName entityType="groups" entityId={policy.group_id} />
          </strong>
        )} can view`}
      />
      <SummaryRow
        icon="table"
        content={
          policy.card_id
            ? jt`rows in the ${(
                <strong>
                  <EntityName
                    entityType="questions"
                    entityId={policy.card_id}
                  />
                </strong>
              )} question`
            : jt`rows in the ${(
                <strong>
                  <EntityName
                    entityType="tables"
                    entityId={policy.table_id}
                    property="display_name"
                  />
                </strong>
              )} table`
        }
      />
      {Object.entries(policy.attribute_remappings).map(
        ([attribute, target], index) => (
          <SummaryRow
            key={attribute}
            icon="funneloutline"
            content={
              index === 0
                ? jt`where ${(
                    <TargetName policy={policy} target={target} />
                  )} equals ${(<span className="text-code">{attribute}</span>)}`
                : jt`and ${(
                    <TargetName policy={policy} target={target} />
                  )} equals ${(<span className="text-code">{attribute}</span>)}`
            }
          />
        ),
      )}
    </div>
  );
};

interface TargetNameProps {
  policy: GroupTableAccessPolicy;
  target: any[];
}

const TargetName = ({ policy, target }: TargetNameProps) => {
  if (Array.isArray(target)) {
    if (
      (target[0] === "variable" || target[0] === "dimension") &&
      target[1][0] === "template-tag"
    ) {
      return (
        <span>
          <strong>{target[1][1]}</strong> variable
        </span>
      );
    } else if (target[0] === "dimension") {
      const fieldRef = target[1];

      return (
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        <QuestionLoader
          questionId={policy.card_id}
          questionObject={
            policy.card_id == null
              ? getRawDataQuestionForTable(policy.table_id)
              : null
          }
        >
          {({ question }: { question: Question }) => {
            if (!question) {
              return null;
            }

            const dimension = question.query().parseFieldReference(fieldRef);
            return (
              <span>
                <strong>{dimension?.render()}</strong> field
              </span>
            );
          }}
        </QuestionLoader>
      );
    }
  }
  return <strong>[{t`Unknown target`}]</strong>;
};
