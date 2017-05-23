/* @flow */
import React, { Component } from "react";
import StepIndicators from 'metabase/components/StepIndicators';
import RetinaImage from 'react-retina-image'

import MetabaseSettings from "metabase/lib/settings";

type Props = {
    onClose: () => void,
}

type State = {
    step: number
}

const STEPS = [
    {
        title: 'Ask questions and explore',
        text: 'Click on charts or tables to explore, or ask a new question using the easy interface or the powerful SQL editor.',
        image: (
            <RetinaImage
                className="absolute full"
                src={`app/assets/img/welcome-modal-1.png`}
            />
        )
    },
    {
        title: 'Make your own charts',
        text: 'Create line charts, scatter plots, maps, and more.',
        image: (
            <RetinaImage
                className="absolute ml-auto mr-auto inline-block left right"
                style={{ bottom: -20,}}
                src={`app/assets/img/welcome-modal-2.png`}
            />
        )
    },
    {
        title: 'Share what you find',
        text: 'Create powerful and flexible dashboards, and send regular updates via email or Slack.',
        image: (
            <RetinaImage
                className="absolute ml-auto mr-auto inline-block left right"
                style={{ bottom: -40 }}
                src={`app/assets/img/welcome-modal-3.png`}
            />
        )
    },
]


export default class NewUserOnboardingModal extends Component {

    props: Props
    state: State = {
        step: 1
    }

    nextStep = () => {
        const stepCount = MetabaseSettings.get("has_sample_dataset") ? 3 : 2
        const nextStep = this.state.step + 1;

        if (nextStep <= stepCount) {
            this.setState({ step: nextStep });
        } else {
            this.props.onClose();
        }
    }

    render() {
        const { step } = this.state;

        const currentStep = STEPS[step -1]

        return (
            <div style={{ maxHeight: '100%', transition: 'height 300ms linear' }}>
                <OnboardingImages
                    currentStep={currentStep}
                />
                <div className="p4 pb3 text-centered">
                    <h2>{currentStep.title}</h2>
                    <p className="ml-auto mr-auto text-paragraph" style={{ maxWidth: 420 }}>
                        {currentStep.text}
                    </p>
                    <div className="flex align-center py2 relative">
                        <div className="ml-auto mr-auto">
                            <StepIndicators
                                currentStep={step}
                                steps={STEPS}
                                goToStep={step => this.setState({ step })}
                            />
                        </div>
                        <a
                            className="link flex-align-right text-bold absolute right"
                            onClick={() => (this.nextStep())}
                        >
                            Next
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}

const OnboardingImages = ({ currentStep }, { currentStep: number }) =>
    <div style={{
        position: 'relative',
        backgroundColor: '#F5F9FE',
        borderBottom: '1px solid #DCE1E4',
        height: 224

    }}>
        { currentStep.image }
    </div>
