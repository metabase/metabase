import React, {Component, PropTypes} from "react";

import cx from "classnames";
import _ from "underscore";

import MetabaseAnalytics from 'metabase/lib/analytics';
import MetabaseUtils from "metabase/lib/utils";
import SettingsEmailFormElement from "./SettingsEmailFormElement.jsx";

export default class SettingsCacheForm extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            formData: {},
            submitting: "default",
            validationErrors: {},
            dirty: false
        }
    }

    static propTypes = {
        elements: PropTypes.array.isRequired,
        updateSettings: PropTypes.func.isRequired
    };

    componentWillMount() {
        let {elements} = this.props;
        let cacheScope = _.findWhere(elements, {key: 'cache-scope'});

        this.setState({
            cacheScope: cacheScope,
            cacheScopeValue: cacheScope.value,
            recentlySaved: false
        });
    }

    handleChangeEvent(element, value, event) {
        if (element.type === "boolean") {
            value = value === true || value === "true";
        } else if (element.type === "duration"){
            value = event.valueInSeconds.toString();
        } else {
            value = MetabaseUtils.isEmpty(value) ? null : value;
        }

        if (element.value !== value) {
            this.setState({
                formData: {...this.state.formData, [element.key]: value},
                dirty: true
            });
        }
    }

    updateSettings(e) {
        e.preventDefault();

        this.setState({
            formErrors: null,
            submitting: "working"
        });

        let {formData} = this.state;

        this.props.updateSettings(formData).then(() => {
            this.setState({
                submitting: "success"
            });

            MetabaseAnalytics.trackEvent("Cache Settings", "Update", "success");

            // show a confirmation for 3 seconds, then return to normal
            setTimeout(() => this.setState({submitting: "default"}), 3000);
        }, (error) => {
            this.setState({
                submitting: "default",
                formErrors: this.handleFormErrors(error)
            });

            MetabaseAnalytics.trackEvent("Cache Settings", "Update", "error");
        });
    }

    render() {
        const {elements} = this.props;
        const {formData, formErrors, submitting, validationErrors, dirty} = this.state;

        let settingsMap = elements.map((element, _) => {
            // merge together data from a couple places to provide a complete view of the Element state
            let errorMessage = (formErrors && formErrors.elements) ? formErrors.elements[element.key] : validationErrors[element.key];
            let value = formData[element.key] != null ?
                formData[element.key]
                : (element.value != null ? element.value : element.defaultValue);

            return {
                element: element,
                value: value,
                component: <SettingsEmailFormElement
                    key={element.key}
                    element={{...element, value, errorMessage}}
                    handleChangeEvent={this.handleChangeEvent.bind(this)}/>
            };
        }).reduce((acc, element) => {
            return {...acc, [element.element.key]: element};
        }, {});

        const isCacheEnabled = settingsMap["cache-enabled"].value;

        let cacheScopeElement = null;
        if (isCacheEnabled) {
            cacheScopeElement = (
                <div>
                    <div className="px2" style={{maxWidth: "585px"}}>
                        <p className="text-grey-4">
                            That's awesome! Now you have to tell us if this cache configuration should be something
                            global or if you want to configure it for every card.
                        </p>
                        <p className="text-grey-4">
                            The <span style={{fontWeight: "bold"}}>global</span> option is recommended if you have not
                            so many databases or if your users are less advanced. This will make ALL your queries to be
                            cached. Ok?
                        </p>
                        <p className="text-grey-4">
                            The <span style={{fontWeight: "bold"}}>card</span> option is recommended if your use case is
                            more unusual. This is very flexible, but now you have to manually configure the cache for
                            every card that you want!
                        </p>
                    </div>
                    <ul>
                        {settingsMap["cache-scope"].component}
                        {settingsMap["cache-scope"].value === "global" ? settingsMap["cache-global-max-age"].component : null}
                        {settingsMap["cache-max-allowed-size"].component}
                    </ul>
                </div>
            );
        }

        let saveSettingsButtonStates = {
            default: "Save changes",
            working: "Saving...",
            success: "Changes saved!"
        };

        const disabled = (submitting !== "default" || !dirty),
            saveButtonText = saveSettingsButtonStates[submitting];

        return (
            <form noValidate>
                <div className="px2" style={{maxWidth: "585px"}}>
                    <h2>Cache Settings</h2>
                    <h3 className="text-grey-1">⚡ Blazing fast Dashboards and Questions! ⚡</h3>

                    <p className="text-grey-4">
                        We can save your question results and reuse it!
                        This can make dashboards and questions load super fast avoiding cached queries to run against
                        your databases during the time that the cache is valid.
                    </p>
                    <p className="text-grey-4">
                        But it can also make the database that MB uses internally slower and your users may see "old"
                        data.
                        We already don't recommend you to use H2 in your installation, but if you do it, just don't turn
                        this feature on, ok?
                    </p>
                </div>
                <ul>
                    {settingsMap["cache-enabled"].component}
                </ul>
                {cacheScopeElement}

                <ul>
                    <li className="m2 mb4">
                        <button
                            className={cx("Button mr2", {"Button--primary": !disabled}, {"Button--success-new": submitting === "success"})}
                            disabled={disabled} onClick={this.updateSettings.bind(this)}>
                            {saveButtonText}
                        </button>
                        { formErrors && formErrors.message ?
                            <span className="pl2 text-error text-bold">{formErrors.message}</span> : null}
                    </li>
                </ul>
            </form>
        );
    }
}
