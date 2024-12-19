/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import L from "metabase/components/List/List.module.css";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/lib/redux";
import { fetchTableMetadata } from "metabase/redux/metadata";
import D from "metabase/reference/components/Detail.module.css";
import FieldToGroupBy from "metabase/reference/components/FieldToGroupBy";
import { getMetadata } from "metabase/selectors/metadata";

import { getQuestionUrl } from "../utils";

import S from "./UsefulQuestions.module.css";

const mapDispatchToProps = {
  fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
});

class FieldsToGroupBy extends Component {
  render() {
    const { fields, databaseId, title, onChangeLocation, metadata } =
      this.props;

    return (
      <div>
        <div className={D.detailBody}>
          <div className={D.detailTitle}>
            <span>{title}</span>
          </div>
          <div className={S.usefulQuestions}>
            {fields &&
              Object.values(fields).map((field, index, fields) => (
                <FieldToGroupBy
                  key={field.id}
                  className={cx(CS.px1, CS.mb1, CS.rounded, CS.bgLightHover)}
                  iconClass={L.icon}
                  field={field}
                  onClick={() =>
                    onChangeLocation(
                      getQuestionUrl({
                        dbId: databaseId,
                        tableId: field.table_id,
                        fieldId: field.id,
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
