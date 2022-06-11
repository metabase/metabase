/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";

import S from "./UsefulQuestions.css";
import D from "metabase/reference/components/Detail.css";
import L from "metabase/components/List.css";

import { getQuestionUrl } from "../utils";

import FieldToGroupBy from "metabase/reference/components/FieldToGroupBy";

import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

class FieldsToGroupBy extends Component {
  render() {
    const {
      fields,
      databaseId,
      metric,
      title,
      onChangeLocation,
      metadata,
    } = this.props;

    return (
      <div>
        <div className={D.detailBody}>
          <div className={D.detailTitle}>
            <span className={D.detailName}>{title}</span>
          </div>
          <div className={S.usefulQuestions}>
            {fields &&
              Object.values(fields).map((field, index, fields) => (
                <FieldToGroupBy
                  key={field.id}
                  className="px1 mb1 rounded bg-light-hover"
                  iconClass={L.icon}
                  field={field}
                  metric={metric}
                  onClick={() =>
                    onChangeLocation(
                      getQuestionUrl({
                        dbId: databaseId,
                        tableId: field.table_id,
                        fieldId: field.id,
                        metricId: metric.id,
                        metadata,
                      }),
                    )
                  }
                  secondaryOnClick={event => {
                    event.stopPropagation();
                    onChangeLocation(
                      `/reference/databases/${databaseId}/tables/${field.table_id}/fields/${field.id}`,
                    );
                  }}
                />
              ))}
          </div>
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(FieldsToGroupBy);
