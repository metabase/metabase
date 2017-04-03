import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import { fetchDatabasesWithMetadata } from "metabase/redux/metadata";

import Icon from "metabase/components/Icon";

import Text from "../components/Text";
import Tip from "../components/Tip";
import Title from "../components/Title";
import { Sidebar } from "../components/Layout";

import { back, resetNewQuestionFlow } from "../actions";

import { getSubtitle, getBack, getCurrentStepTip, getCurrentStepComponent } from "../selectors";

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
            <div className="relative full-height" style={{ backgroundColor: '#FBFCFC' }}>
                <div
                    className={cxs({
                        backgroundColor: '#fff',
                        display: "flex",
                        alignItems: "center",
                        borderBottom: '1px solid #DCE1E4',
                        paddingTop: '2em',
                        paddingBottom: '2em',
                    })}
                >
                    <div className="wrapper flex align-center">
                        {back &&
                            <div
                                className={cxs({
                                    borderRadius: 99,
                                    border: "1px solid #93A1AB",
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
                            </div>}
                        <div>
                            <Title>{title}</Title>
                            {subtitle && <Text>{subtitle}</Text>}
                        </div>
                    </div>
                </div>

                <div className="wrapper">
                <div className="flex mt4">
                        <div className={cxs({ flex: 1 })}>
                            <CurrentStep />
                        </div>

                        {tip &&
                            <Sidebar>
                                <Tip tip={tip} />
                            </Sidebar>}
                    </div>
                </div>
            </div>
        );
    }
}

export default NewQuestion;
