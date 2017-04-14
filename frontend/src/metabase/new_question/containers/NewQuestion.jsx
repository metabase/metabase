import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import { fetchDatabasesWithMetadata } from "metabase/redux/metadata";

import Icon from "metabase/components/Icon";

import Text from "metabase/components/Text";
import Title from "metabase/components/Title";

import Tip from "../components/Tip";
import { Sidebar } from "../components/Layout";

import { back, resetNewQuestionFlow } from "../actions";

import {
    getSubtitle,
    getBack,
    getCurrentStepTip,
    getCurrentStepComponent
} from "../selectors";

const mapStateToProps = state => ({
    advance: state.newQuestion.advance,
    back: getBack(state),
    component: getCurrentStepComponent(state),
    subtitle: getSubtitle(state),
    tip: getCurrentStepTip(state),
    title: state.newQuestion.flow.title
});

const mapDispatchToProps = {
    fetchDatabasesWithMetadata,
    goBack: back,
    resetNewQuestionFlow
};

const BackButton = ({ goBack }) => (
    <div
        className={cxs({
            borderRadius: 99,
            border: "1px solid #93A1AB",
            backgroundColor: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            marginRight: "1em",
            ":hover": {
                cursor: "pointer"
            }
        })}
        onClick={() => goBack()}
    >
        <Icon name="chevronleft" />
    </div>
);

@connect(mapStateToProps, mapDispatchToProps)
class NewQuestion extends Component {
    componentDidMount() {
        this.props.resetNewQuestionFlow();
        this.props.fetchDatabasesWithMetadata();
    }
    render() {
        const { back, goBack, component, tip, title, subtitle } = this.props;
        const CurrentStep = component;
        return (
            <div
                className="relative full-height"
                style={{ backgroundColor: "#F2F4F5" }}
            >
                <div
                    className={cxs({
                        display: "flex",
                        marginTop: "2em",
                        maxWidth: tip ? "80%" : null,
                        marginLeft: tip ? "auto" : null,
                        marginRight: tip ? "auto" : null
                    })}
                >
                    <div className="flex align-center">
                        {back && <BackButton goBack={goBack} />}
                    </div>
                </div>
                <div
                    className={cxs({
                        display: "flex",
                        marginTop: "2em",
                        maxWidth: tip ? "80%" : null,
                        marginLeft: tip ? "auto" : null,
                        marginRight: tip ? "auto" : null
                    })}
                >

                    {tip &&
                        <Sidebar>
                            <div className={cxs({ marginTop: "6em" })}>
                                <Tip tip={tip} />
                            </div>
                        </Sidebar>}
                    <div
                        className={cxs({
                            flex: 1,
                            height: "100%",
                            marginLeft: "4em"
                        })}
                    >
                        <CurrentStep />
                    </div>
                </div>
            </div>
        );
    }
}

export default NewQuestion;
