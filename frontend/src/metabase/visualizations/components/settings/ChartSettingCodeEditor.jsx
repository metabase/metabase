import React, { Component, PropTypes } from "react";

import AceEditor from "metabase/components/AceEditor.jsx";

export default class ChartSettingCodeEditor extends Component {
    render() {
        let { value, mode, onChange } = this.props;
        return (
            <AceEditor
                style={{ width: "100%", minHeight: 400 }}
                mode={mode}
                value={value}
                onChange={onChange}
            />
        );
    }
}
