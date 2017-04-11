import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./UsefulQuestions.css";
import D from "metabase/reference/components/Detail.css";
import L from "metabase/components/List.css";

import {
    getQuestionUrl
} from '../utils';

import FieldToGroupBy from "metabase/reference/components/FieldToGroupBy.jsx";

const FieldsToGroupBy = ({
    fields,
    databaseId,
    metric,
    title,
    onChangeLocation
}) =>
    <div className={cx(D.detail)}>
        <div className={D.detailBody}>
            <div className={D.detailTitle}>
                <span className={D.detailName}>{title}</span>
            </div>
            <div className={S.usefulQuestions}>
                { fields && Object.values(fields)
                        .map((field, index, fields) =>
                            <FieldToGroupBy
                                key={field.id}
                                className={cx("border-bottom", "pt1", "pb1")}
                                iconClass={L.icon}
                                field={field}
                                metric={metric}
                                onClick={() => onChangeLocation(getQuestionUrl({
                                        dbId: databaseId,
                                        tableId: field.table_id,
                                        fieldId: field.id,
                                        metricId: metric.id
                                    }))}
                                secondaryOnClick={(event) => {
                                    event.stopPropagation();
                                    onChangeLocation(`/reference/databases/${databaseId}/tables/${field.table_id}/fields/${field.id}`);
                                }}
                            />
                        )
                }
            </div>
        </div>
    </div>;
FieldsToGroupBy.propTypes = {
    fields: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    metric: PropTypes.object.isRequired,
    title: PropTypes.string.isRequired,
    onChangeLocation: PropTypes.func.isRequired
};

export default pure(FieldsToGroupBy);
