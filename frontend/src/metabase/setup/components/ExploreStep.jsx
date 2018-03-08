import React from "react";
import { Link } from "react-router";
import Icon from "metabase/components/Icon";
import { t } from "c-3po";

import StepTitle from "./StepTitle.jsx";
import CollapsedStep from "./CollapsedStep.jsx";

const DEMO_URL = "/onboard/dash";

const ExploreStep = ({ options, activeStep, stepNumber, stepText }) => {
  if (activeStep === stepNumber) {
    return (
      <CollapsedStep
        stepNumber={stepNumber}
        stepCircleText="4"
        stepText={"Explore your data"}
        isCompleted={false}
        setActiveStep={() => console.log("")}
      />
    );
  }
  return (
    <div className="SetupStep rounded full relative p4">
      {" "}
      <StepTitle title={stepText} circleText={"4"} />
      <div className="mb3">
        <h2>{t`Hi, Metabot here`}</h2>
        <p>
          {t`I started looking at the data you just connected, and I have some explorations for you to look at. I call these x-rays. Hope you like them!`}
        </p>
      </div>
      <ol className="Grid Grid--1of2 Grid--gutters">
        {options.map((option, index) => (
          <li className="Grid-cell" key={index}>
            <Link to={option.url} className="link flex align-center text-bold">
              <div
                className="bg-slate-almost-extra-light p2 flex align-center rounded mr1 justify-center text-gold"
                style={{ width: 48, height: 48 }}
              >
                <Icon name="bolt" size={32} />
              </div>
              {option.name}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
};

ExploreStep.defaultProps = {
  options: [
    { name: "Test 1", url: DEMO_URL },
    { name: "Test 2", url: DEMO_URL },
    { name: "Test 3", url: DEMO_URL },
  ],
};

export default ExploreStep;
