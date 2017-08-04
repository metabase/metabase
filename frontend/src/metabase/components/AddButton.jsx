import React from "react";
import IconBorder from "metabase/components/IconBorder";
import Icon from "metabase/components/Icon";

const AddButton = ({ text, onClick, targetRefName }) => {
    const addIcon =
        <IconBorder borderRadius="3px" ref={targetRefName}>
            <Icon name="add" size={14}/>
        </IconBorder>;

    let className = "AddButton text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color";
    if (onClick) {
        return (
            <a className={className} onClick={onClick}>
                { text && <span className="mr1">{text}</span> }
                { addIcon }
            </a>
        );
    } else {
        return (
            <span className={className}>
                    { text && <span className="mr1">{text}</span> }
                { addIcon }
                </span>
        );
    }
};

export default AddButton;
