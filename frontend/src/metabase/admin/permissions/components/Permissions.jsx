import React from "react";

function PermissionsTitle({ buttonTitle, buttonAction }) {
    return (
        <div className="MetadataEditor-header clearfix flex-no-shrink">
            <div className="MetadataEditor-headerSection float-left h2 text-grey-4">
                Permissions
            </div>
            {buttonTitle && buttonAction ? (
                 <button className="Button Button--primary float-right" onClick={buttonAction}>
                     {buttonTitle}
                 </button>
            ) : null}
        </div>
    );
}

export default function Permissions({ leftNavPane, children, rightTitleButtonTitle, rightTitleButtonAction }) {
    return (
        <div className="flex p4">
            <div className="MetadataEditor flex-column full-height">
                <PermissionsTitle buttonTitle={rightTitleButtonTitle} buttonAction={rightTitleButtonAction} />
                {leftNavPane}
            </div>
            <div className="flex-column flex-full m4">
                {children}
            </div>
        </div>
    );
}
