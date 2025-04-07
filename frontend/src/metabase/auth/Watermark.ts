import {BlindWatermark, Watermark} from 'watermark-js-plus'

const current = localStorage.getItem("current");
const commonName = JSON.parse(current).common_name;
const watermark = new BlindWatermark({
  content: commonName ?? 'watermark',
  width: 200,
  height: 200,
  onSuccess: () => {
    // success callback
  }
})

const createWatermark = (content: string) => new Watermark({
  content: content ?? 'watermark',
  width: 200,
  height: 200,
  onSuccess: () => {
    // success callback
  }
})

// watermark.create()

export {watermark, createWatermark}
