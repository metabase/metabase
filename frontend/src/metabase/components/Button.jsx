import React from "react";

import { View, Text, StyleSheet } from "react-primitives";

var buttonStyles = StyleSheet.create({
    button: {
        backgroundColor: "#FBFCFD",
        borderColor: "#ddd",
        borderWidth: 1,
        borderRadius: 4,
        padding: 10
    },
    text: {
        color: "#444",
        fontWeight: "bold"
    },
    icon: {
        marginRight: 20
    }
});

var variants = {
    primary: StyleSheet.create({
        button: {
            backgroundColor: "#509EE3",
            borderColor: "#509EE3"
        },
        text: {
            color: "#FFF"
        }
    })
};

const BUTTON_VARIANTS = [
    "small",
    "medium",
    "large",
    "primary",
    "warning",
    "cancel",
    "success",
    "purple",
    "borderless"
];

const Button = ({ icon, children, ...props }) => {
    const style = name => [
        buttonStyles[name],
        ...BUTTON_VARIANTS.filter(variant => props[variant])
            .map(variant => variants[variant] && variants[variant][name])
            .filter(s => s)
    ];

    return (
        <View style={style("button")}>
            {/* {icon && <Icon name={icon} size={14} style={style("icon")} />} */}
            {typeof children === "string"
                ? <Text style={style("text")}>{children}</Text>
                : children}
        </View>
    );
};

export default Button;
