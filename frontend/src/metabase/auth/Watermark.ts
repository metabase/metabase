import {Watermark} from 'watermark-js-plus'

const createWatermark = (content: string) => new Watermark({
  content: content ?? 'watermark',
  width: 240,
  "height": 120,
  "rotate": 22,
  "contentType": "text",
  "globalAlpha": 0.2,
  "mode": "default",
  "textType": "fill",
  "lineHeight": 30,
  "fontSize": "12px",
  "fontFamily": "sans-serif",
  "fontStyle": "",
  "fontVariant": "",
  "fontColor": "#000",
  "fontWeight": "normal",
  "filter": "none",
  "letterSpacing": "0px",
  onSuccess: () => {
    // success callback
  }
})

// watermark.create()

export {createWatermark}
