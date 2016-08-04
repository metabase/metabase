import React, { Component, PropTypes } from "react";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./UsefulQuestions.css";
import D from "metabase/components/Detail.css";
import L from "metabase/components/List.css";

import {
    getQuestionUrl
} from '../utils';

import QueryButton from "metabase/components/QueryButton.jsx";

const FieldsToGroupBy = ({
    table,
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
                { table && table.fields_lookup &&
                    Object.values(table.fields_lookup)
                        .map((field, index, fields) =>
                            <QueryButton
                                key={field.id}
                                className={cx("border-bottom", "pt1", "pb1")}
                                iconClass={L.icon}
                                text={field.display_name}
                                icon="reference"
                                onClick={() => onChangeLocation(`/reference/databases/${table.db_id}/tables/${table.id}/fields/${field.id}`)}
                                secondaryText={`see ${metric.name} by ${field.display_name}`}
                                secondaryOnClick={(event) => {
                                    event.stopPropagation();
                                    onChangeLocation(getQuestionUrl({
                                        dbId: table.db_id,
                                        tableId: table.id,
                                        fieldId: field.id,
                                        metricId: metric.id
                                    }))
                                }}
                            />
                        )
                }
            </div>
        </div>
    </div>;
FieldsToGroupBy.propTypes = {
    table: PropTypes.object.isRequired,
    title: PropTypes.string.isRequired,
    onChangeLocation: PropTypes.func.isRequired
};

export default pure(FieldsToGroupBy);
