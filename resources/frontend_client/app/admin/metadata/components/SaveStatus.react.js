'use strict';

import Icon from '../../../query_builder/icon.react';
import LoadingIcon from '../../../components/icons/loading.react';

export default React.createClass({
    displayName: "SaveStatus",

    getInitialState: function() {
        return {
            saving: false,
            recentlySavedTimeout: null,
            error: null
        }
    },

    setSaving: function() {
        clearTimeout(this.state.recentlySavedTimeout);
        this.setState({ saving: true, recentlySavedTimeout: null, error: null });
    },

    setSaved: function() {
        clearTimeout(this.state.recentlySavedTimeout);
        var recentlySavedTimeout = setTimeout(() => this.setState({ recentlySavedTimeout: null }), 5000);
        this.setState({ saving: false, recentlySavedTimeout: recentlySavedTimeout, error: null });
    },

    setSaveError: function(error) {
        this.setState({ saving: false, recentlySavedTimeout: null, error: error });
    },

    render: function() {
        if (this.state.saving) {
            return (<div className="SaveStatus mx2 px2 border-right"><LoadingIcon width="24" height="24" /></div>);
        } else if (this.state.error) {
            return (<div className="SaveStatus mx2 px2 border-right text-error">Error: {this.state.error}</div>)
        } else if (this.state.recentlySavedTimeout != null) {
            return (
                <div className="SaveStatus mx2 px2 border-right flex align-center text-success">
                    <Icon name="check" width="16" height="16" />
                    <div className="ml1 h3 text-bold">Saved</div>
                </div>
            )
        } else {
            return <span />;
        }
    }
});
