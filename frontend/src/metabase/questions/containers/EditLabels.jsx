/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import S from "./EditLabels.css";

import Confirm from "metabase/components/Confirm.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import * as labelsActions from "../labels";
import { getLabels, getLabelsLoading, getLabelsError, getEditingLabelId } from "../selectors";

import * as colors from "metabase/lib/colors";

const mapStateToProps = (state, props) => {
  return {
      labels:           getLabels(state, props),
      labelsLoading:    getLabelsLoading(state, props),
      labelsError:      getLabelsError(state, props),
      editingLabelId:   getEditingLabelId(state, props)
  }
}

const mapDispatchToProps = {
    ...labelsActions
};

import Icon from "metabase/components/Icon.jsx";

// import LabelEditor from "../components/LabelEditor.jsx";
import LabelEditorForm from "./LabelEditorForm.jsx";
import LabelIcon from "metabase/components/LabelIcon.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";

@connect(mapStateToProps, mapDispatchToProps)
export default class EditLabels extends Component {
    static propTypes = {
        style:          PropTypes.object,
        labels:         PropTypes.array.isRequired,
        labelsLoading:  PropTypes.bool.isRequired,
        labelsError:    PropTypes.any,
        editingLabelId: PropTypes.number,
        saveLabel:      PropTypes.func.isRequired,
        editLabel:      PropTypes.func.isRequired,
        deleteLabel:    PropTypes.func.isRequired,
        loadLabels:     PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.loadLabels();
    }

    render() {
        const { style, labels, labelsLoading, labelsError, editingLabelId, saveLabel, editLabel, deleteLabel } = this.props;
        return (
            <div className={S.editor} style={style}>
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>Add and edit labels</div>
                    <div className="bordered border-error rounded p2 mb2">
                        <h3 className="text-error mb1">Heads up!</h3>
                        <div>In an upcoming release, Labels will be removed in favor of Collections.</div>
                    </div>
                </div>
                <LabelEditorForm onSubmit={saveLabel} initialValues={{ icon: colors.normal.blue, name: "" }} submitButtonText={"Create Label"} className="wrapper wrapper--trim"/>
                <LoadingAndErrorWrapper loading={labelsLoading} error={labelsError} noBackground noWrapper>
                { () => labels.length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <ul className={S.list}>
                        { labels.map(label =>
                            editingLabelId === label.id ?
                                <li key={label.id} className={S.labelEditing}>
                                    <LabelEditorForm formKey={String(label.id)} className="flex-full" onSubmit={saveLabel} initialValues={label} submitButtonText={"Update Label"}/>
                                    <a className={" text-grey-1 text-grey-4-hover ml2"} onClick={() => editLabel(null)}>Cancel</a>
                                </li>
                            :
                                <li key={label.id} className={S.label}>
                                    <LabelIcon icon={label.icon} size={28} />
                                    <span className={S.name}>{label.name}</span>
                                    <a className={S.edit} onClick={() => editLabel(label.id)}>Edit</a>
                                    <Confirm title={`Delete label "${label.name}"`} action={() => deleteLabel(label.id)}>
                                        <Icon className={S.delete + " text-grey-1 text-grey-4-hover"} name="close" size={14} />
                                    </Confirm>
                                </li>
                        )}
                        </ul>
                    </div>
                :
                    <div className="full-height full flex-full flex align-center justify-center">
                        <EmptyState message="Create labels to group and manage questions." icon="label" />
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        );
    }
}
