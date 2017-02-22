/* @flow */

import React, { Component, PropTypes } from "react";
import RetinaImage from 'react-retina-image';

import type { EmbedType } from "./EmbedModalContent"

type Props = {
     resourceType: string,
     onChangeEmbedType: (embedType: EmbedType) => void
};

const EmbedTypePicker = ({ onChangeEmbedType, resourceType }: Props) =>
    <div className="flex full layout-centered">
        <div className="Grid Grid--1of2 bordered rounded">
            <div className="Grid-cell p4 cursor-pointer flex flex-column text-centered text-brand-hover" onClick={() => onChangeEmbedType("simple")}>
                <div className="m3 py3 flex align-center justify-center" style={{ height: 140 }}>
                    <RetinaImage
                        width={164}
                        src="/app/img/simple_embed.png"
                        forceOriginalDimensions={false}
                    />
                </div>
                <div className="mt-auto" style={{ maxWidth: 320 }}>
                    <h2 className="text-brand">Simple</h2>
                    <p className="text-measure text-paragraph">Share your data with the world by embedding this {resourceType} in blog posts or web pages.</p>
                </div>
            </div>
            <div className="Grid-cell p4 cursor-pointer flex flex-column text-centered border-left text-green-hover"  onClick={() => onChangeEmbedType("application")}>
                <div className="m3 py3 flex align-center justify-center" style={{ height: 140 }}>
                    <RetinaImage
                        width={177}
                        src="/app/img/secure_embed.png"
                        forceOriginalDimensions={false}
                    />
                </div>
                <div className="mt-auto" style={{ maxWidth: 320 }}>
                    <h2 className="text-green">Advanced</h2>
                    <p className="text-measure text-paragraph ml-auto mr-auto">Embed this {resourceType} in your app and let your server provide parameter values and security.</p>
                </div>
            </div>
        </div>
    </div>;

export default EmbedTypePicker;
