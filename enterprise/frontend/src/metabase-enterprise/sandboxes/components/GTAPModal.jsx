/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { jt, t } from "ttag";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MappingEditor from "./MappingEditor";

import QuestionPicker from "metabase/containers/QuestionPicker";
import QuestionParameterTargetWidget from "../containers/QuestionParameterTargetWidget";
import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Select, { Option } from "metabase/core/components/Select";
import Radio from "metabase/core/components/Radio";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { GTAPApi } from "metabase/services";

import { UNKNOWN_ERROR_MESSAGE } from "metabase/components/form/FormMessage";

import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";
import QuestionLoader from "metabase/containers/QuestionLoader";

import Dimension from "metabase-lib/lib/Dimension";

import { getParentPath } from "metabase/hoc/ModalRoute";
import { updateTableSandboxingPermission } from "../actions";

const mapStateToProps = () => ({});
const mapDispatchToProps = {
  push,
  updateTableSandboxingPermission,
};

class GTAPModal extends React.Component {
  state = {
    gtap: null,
    attributesOptions: null,
    simple: true,
    error: null,
  };

  async UNSAFE_componentWillMount() {
    const { params } = this.props;

    GTAPApi.attributes().then(attributesOptions =>
      this.setState({ attributesOptions }),
    );

    const groupId = parseInt(params.groupId);
    const tableId = parseInt(params.tableId);
    const gtaps = await GTAPApi.list();
    let gtap = _.findWhere(gtaps, { group_id: groupId, table_id: tableId });
    if (!gtap) {
      gtap = {
        table_id: tableId,
        group_id: groupId,
        card_id: null,
        attribute_remappings: { "": null },
      };
    }
    if (Object.keys(gtap.attribute_remappings).length === 0) {
      gtap.attribute_remappings = { "": null };
    }
    this.setState({ gtap, simple: gtap.card_id == null });
  }

  close = () => {
    const { push, route, location } = this.props;
    return push(getParentPath(route, location));
  };

  _getCanonicalGTAP() {
    const { gtap, simple } = this.state;
    if (!gtap) {
      return null;
    }
    return {
      ...gtap,
      card_id: simple ? null : gtap.card_id,
      attribute_remappings: _.pick(
        gtap.attribute_remappings,
        (value, key) => value && key,
      ),
    };
  }

  save = async () => {
    const gtap = this._getCanonicalGTAP();
    if (!gtap) {
      throw new Error("No GTAP");
    }
    try {
      if (gtap.id != null) {
        await GTAPApi.update(gtap);
      } else {
        await GTAPApi.create(gtap);
      }
      this.props.updateTableSandboxingPermission(this.props.params);
      this.close();
    } catch (error) {
      console.error("Error saving GTAP", error);
      const message = error
        ? error.data
          ? error.data.message || JSON.stringify(error.data)
          : JSON.stringify(error)
        : UNKNOWN_ERROR_MESSAGE;
      this.setState({ error: message });
      throw new Error(message);
    }
  };

  isValid() {
    const gtap = this._getCanonicalGTAP();
    const { simple } = this.state;
    if (!gtap) {
      return false;
    } else if (simple) {
      return Object.entries(gtap.attribute_remappings).length > 0;
    } else {
      return gtap.card_id != null;
    }
  }

  render() {
    const { gtap, simple, attributesOptions } = this.state;

    const valid = this.isValid();
    const canonicalGTAP = this._getCanonicalGTAP();

    const remainingAttributesOptions =
      gtap && attributesOptions
        ? attributesOptions.filter(
            attribute => !(attribute in gtap.attribute_remappings),
          )
        : [];

    const hasAttributesOptions =
      attributesOptions && attributesOptions.length > 0;
    const hasValidMappings =
      Object.keys((canonicalGTAP || {}).attribute_remappings || {}).length > 0;

    return (
      <div>
        <h2 className="p3">{t`Grant sandboxed access to this table`}</h2>
        <LoadingAndErrorWrapper loading={!gtap}>
          {() =>
            gtap && (
              <div>
                <div className="px3 pb3">
                  <div className="pb3">
                    {t`When users in this group view this table they'll see a version of it that's filtered by their user attributes, or a custom view of it based on a saved question.`}
                  </div>
                  <h4 className="pb1">
                    {t`How do you want to filter this table for users in this group?`}
                  </h4>
                  <Radio
                    value={simple}
                    options={[
                      { name: "Filter by a column in the table", value: true },
                      {
                        name:
                          "Use a saved question to create a custom view for this table",
                        value: false,
                      },
                    ]}
                    onChange={simple => this.setState({ simple })}
                    vertical
                  />
                </div>
                {!simple && (
                  <div className="px3 pb3">
                    <div className="pb2">
                      {t`Pick a saved question that returns the custom view of this table that these users should see.`}
                    </div>
                    <QuestionPicker
                      value={gtap.card_id}
                      onChange={card_id =>
                        this.setState({ gtap: { ...gtap, card_id } })
                      }
                    />
                  </div>
                )}
                {gtap &&
                  attributesOptions &&
                  // show if in simple mode, or the admin has selected a card
                  (simple || gtap.card_id != null) &&
                  (hasAttributesOptions || hasValidMappings ? (
                    <div className="p3 border-top border-bottom">
                      {!simple && (
                        <div className="pb2">
                          {t`You can optionally add additional filters here based on user attributes. These filters will be applied on top of any filters that are already in this saved question.`}
                        </div>
                      )}
                      <AttributeMappingEditor
                        value={gtap.attribute_remappings}
                        onChange={attribute_remappings =>
                          this.setState({
                            gtap: { ...gtap, attribute_remappings },
                          })
                        }
                        simple={simple}
                        gtap={gtap}
                        attributesOptions={remainingAttributesOptions}
                      />
                    </div>
                  ) : (
                    <div className="px3">
                      <AttributeOptionsEmptyState
                        title={
                          simple
                            ? t`For this option to work, your users need to have some attributes`
                            : t`To add additional filters, your users need to have some attributes`
                        }
                      />
                    </div>
                  ))}
              </div>
            )
          }
        </LoadingAndErrorWrapper>
        <div className="p3">
          {valid && canonicalGTAP && (
            <div className="pb1">
              <GTAPSummary gtap={canonicalGTAP} />
            </div>
          )}
          <div className="flex align-center justify-end">
            <Button onClick={this.close}>{t`Cancel`}</Button>
            <ActionButton
              className="ml1"
              actionFn={this.save}
              primary
              disabled={!valid}
            >
              {t`Save`}
            </ActionButton>
          </div>
          {this.state.error && (
            <div className="flex align-center my2 text-error">
              {this.state.error}
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(GTAPModal);

const AttributePicker = ({ value, onChange, attributesOptions }) => (
  <div style={{ minWidth: 200 }}>
    <Select
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={
        attributesOptions.length === 0
          ? t`No user attributes`
          : t`Pick a user attribute`
      }
      disabled={attributesOptions.length === 0}
    >
      {attributesOptions.map(attributesOption => (
        <Option key={attributesOption} value={attributesOption}>
          {attributesOption}
        </Option>
      ))}
    </Select>
  </div>
);

const QuestionTargetPicker = ({ value, onChange, questionId }) => (
  <div style={{ minWidth: 200 }}>
    <QuestionParameterTargetWidget
      questionId={questionId}
      target={value}
      onChange={onChange}
      placeholder={t`Pick a parameter`}
    />
  </div>
);

const rawDataQuestionForTable = tableId => ({
  dataset_query: {
    type: "query",
    query: { "source-table": tableId },
  },
});

const TableTargetPicker = ({ value, onChange, tableId }) => (
  <div style={{ minWidth: 200 }}>
    <QuestionParameterTargetWidget
      questionObject={rawDataQuestionForTable(tableId)}
      target={value}
      onChange={onChange}
      placeholder={t`Pick a column`}
    />
  </div>
);

const SummaryRow = ({ icon, content }) => (
  <div className="flex align-center">
    <Icon className="p1" name={icon} />
    <span>{content}</span>
  </div>
);

const GTAPSummary = ({ gtap }) => {
  return (
    <div>
      <div className="px1 pb2 text-uppercase text-small text-grey-4">
        Summary
      </div>
      <SummaryRow
        icon="group"
        content={jt`Users in ${(
          <GroupName groupId={gtap.group_id} />
        )} can view`}
      />
      <SummaryRow
        icon="table"
        content={
          gtap.card_id
            ? jt`rows in the ${(
                <QuestionName questionId={gtap.card_id} />
              )} question`
            : jt`rows in the ${(<TableName tableId={gtap.table_id} />)} table`
        }
      />
      {Object.entries(gtap.attribute_remappings).map(
        ([attribute, target], index) => (
          <SummaryRow
            key={attribute}
            icon="funneloutline"
            content={
              index === 0
                ? jt`where ${(
                    <TargetName gtap={gtap} target={target} />
                  )} equals ${(<span className="text-code">{attribute}</span>)}`
                : jt`and ${(
                    <TargetName gtap={gtap} target={target} />
                  )} equals ${(<span className="text-code">{attribute}</span>)}`
            }
          />
        ),
      )}
    </div>
  );
};

// TODO: use EntityName component
const GroupName = ({ groupId }) => (
  <EntityObjectLoader
    entityType="groups"
    entityId={groupId}
    properties={["name"]}
    loadingAndErrorWrapper={false}
  >
    {({ object }) => <strong>{object && object.name}</strong>}
  </EntityObjectLoader>
);

// TODO: use EntityName component
const QuestionName = ({ questionId }) => (
  <EntityObjectLoader
    entityType="questions"
    entityId={questionId}
    properties={["name"]}
    loadingAndErrorWrapper={false}
  >
    {({ object }) => <strong>{object && object.name}</strong>}
  </EntityObjectLoader>
);

// TODO: use EntityName component
const TableName = ({ tableId }) => (
  <EntityObjectLoader
    entityType="tables"
    entityId={tableId}
    properties={["display_name"]}
    loadingAndErrorWrapper={false}
  >
    {({ object }) => <strong>{object && object.display_name}</strong>}
  </EntityObjectLoader>
);

const TargetName = ({ gtap, target }) => {
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
      return (
        <QuestionLoader
          questionId={gtap.card_id}
          questionObject={
            gtap.card_id == null ? rawDataQuestionForTable(gtap.table_id) : null
          }
        >
          {({ question }) =>
            question && (
              <span>
                <strong>
                  {Dimension.parseMBQL(target[1], question.metadata()).render()}
                </strong>{" "}
                field
              </span>
            )
          }
        </QuestionLoader>
      );
    }
  }
  return <emphasis>[Unknown target]</emphasis>;
};

const AttributeOptionsEmptyState = ({ title }) => (
  <div className="flex align-center rounded bg-slate-extra-light p2">
    <img
      src="app/assets/img/attributes_illustration.png"
      srcSet="
        app/assets/img/attributes_illustration.png    1x,
        app/assets/img/attributes_illustration@2x.png 2x,
      "
      className="mr2"
    />
    <div>
      <h3 className="pb1">{title}</h3>
      <div>{t`You can add attributes automatically by setting up an SSO that uses SAML, or you can enter them manually by going to the People section and clicking on the … menu on the far right.`}</div>
    </div>
  </div>
);

const AttributeMappingEditor = ({
  value,
  onChange,
  simple,
  attributesOptions,
  gtap,
}) => (
  <MappingEditor
    style={{ width: "100%" }}
    value={value}
    onChange={onChange}
    keyPlaceholder={t`Pick a user attribute`}
    keyHeader={
      <div className="text-uppercase text-small text-grey-4 flex align-center">
        {t`User attribute`}
        <Tooltip
          tooltip={t`We can automatically get your users’ attributes if you’ve set up SSO, or you can add them manually from the "…" menu in the People section of the Admin Panel.`}
        >
          <Icon className="ml1" name="info_outline" />
        </Tooltip>
      </div>
    }
    renderKeyInput={({ value, onChange }) => (
      <AttributePicker
        value={value}
        onChange={onChange}
        attributesOptions={(value ? [value] : []).concat(attributesOptions)}
      />
    )}
    render
    valuePlaceholder={simple ? t`Pick a column` : t`Pick a parameter`}
    valueHeader={
      <div className="text-uppercase text-small text-grey-4">
        {simple ? t`Column` : t`Parameter or variable`}
      </div>
    }
    renderValueInput={({ value, onChange }) =>
      simple && gtap.table_id != null ? (
        <TableTargetPicker
          value={value}
          onChange={onChange}
          tableId={gtap.table_id}
        />
      ) : !simple && gtap.card_id != null ? (
        <QuestionTargetPicker
          value={value}
          onChange={onChange}
          questionId={gtap.card_id}
        />
      ) : null
    }
    divider={<span className="px2 text-bold">{t`equals`}</span>}
    addText={t`Add a filter`}
    canAdd={attributesOptions.length > 0}
    canDelete={true}
    swapKeyAndValue
  />
);
