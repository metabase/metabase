'use strict';

/*
    Metabase Icon Paths
    -----

    These paths represent the current canonical icon set for Metabase.and are referenced by icons
    used in both React and Angular components as a central source of truth.

    USAGE:

*/

export var ICON_PATHS = {
    add: 'M19,13 L19,2 L14,2 L14,13 L2,13 L2,18 L14,18 L14,30 L19,30 L19,18 L30,18 L30,13 L19,13 Z',
    addtodash: {
        path: 'M15,14 L15,12 L14,12 L14,14 L12,14 L12,15 L14,15 L14,17 L15,17 L15,15 L17,15 L17,14 L15,14 Z M0,0 L5,0 L5,5 L0,5 L0,0 Z M17,6 L6,6 L6,11 L17,11 L17,6 Z M0,12 L11,12 L11,17 L0,17 L0,12 Z M6,0 L11,0 L11,5 L6,5 L6,0 Z M12,0 L17,0 L17,5 L12,5 L12,0 Z M5,6 L0,6 L0,11 L5,11 L5,6 Z',
        attrs: { viewBox: '0 0 17 17' }
    },
    area: 'M25.4980562,23.9977382 L26.0040287,23.9999997 L26.0040283,22.4903505 L26.0040283,14 L26.0040287,12 L25.3213548,13.2692765 C25.3213548,13.2692765 22.6224921,15.7906709 21.2730607,17.0513681 C21.1953121,17.1240042 15.841225,18.0149981 15.841225,18.0149981 L15.5173319,18.0717346 L15.2903187,18.3096229 L10.5815987,23.2439142 L9.978413,23.9239006 L11.3005782,23.9342813 L25.4980562,23.9977382 L11.3050484,23.9342913 L16.0137684,19 L21.7224883,18 L26.0040283,14 L26.0040283,23.4903505 C26.0040283,23.7718221 25.7731425,23.9989679 25.4980562,23.9977382 Z M7,23.9342913 L14,16 L21,14 L25.6441509,9.35958767 C25.8429057,9.16099288 26.0040283,9.22974944 26.0040283,9.49379817 L26.0040283,13 L26.0040283,24 L7,23.9342913 Z',
    bar: 'M9,20 L12,20 L12,24 L9,24 L9,20 Z M14,14 L17,14 L17,24 L14,24 L14,14 Z M19,9 L22,9 L22,24 L19,24 L19,9 Z',
    cards: 'M16.5,11 C16.1340991,11 15.7865579,10.9213927 15.4733425,10.7801443 L7.35245972,21.8211652 C7.7548404,22.264891 8,22.8538155 8,23.5 C8,24.8807119 6.88071187,26 5.5,26 C4.11928813,26 3,24.8807119 3,23.5 C3,22.1192881 4.11928813,21 5.5,21 C5.87370843,21 6.22826528,21.0819977 6.5466604,21.2289829 L14.6623495,10.1950233 C14.2511829,9.74948188 14,9.15407439 14,8.5 C14,7.11928813 15.1192881,6 16.5,6 C17.8807119,6 19,7.11928813 19,8.5 C19,8.96980737 18.8704088,9.4093471 18.6450228,9.78482291 L25.0405495,15.4699905 C25.4512188,15.1742245 25.9552632,15 26.5,15 C27.8807119,15 29,16.1192881 29,17.5 C29,18.8807119 27.8807119,20 26.5,20 C25.1192881,20 24,18.8807119 24,17.5 C24,17.0256697 24.1320984,16.5821926 24.3615134,16.2043506 L17.9697647,10.5225413 C17.5572341,10.8228405 17.0493059,11 16.5,11 Z M5.5,25 C6.32842712,25 7,24.3284271 7,23.5 C7,22.6715729 6.32842712,22 5.5,22 C4.67157288,22 4,22.6715729 4,23.5 C4,24.3284271 4.67157288,25 5.5,25 Z M26.5,19 C27.3284271,19 28,18.3284271 28,17.5 C28,16.6715729 27.3284271,16 26.5,16 C25.6715729,16 25,16.6715729 25,17.5 C25,18.3284271 25.6715729,19 26.5,19 Z M16.5,10 C17.3284271,10 18,9.32842712 18,8.5 C18,7.67157288 17.3284271,7 16.5,7 C15.6715729,7 15,7.67157288 15,8.5 C15,9.32842712 15.6715729,10 16.5,10 Z',
    check: 'M1 14 L5 10 L13 18 L27 4 L31 8 L13 26 z ',
    chevrondown: 'M1 12 L16 26 L31 12 L27 8 L16 18 L5 8 z ',
    chevronleft: 'M20 1 L24 5 L14 16 L24 27 L20 31 L6 16 z',
    chevronright: 'M12 1 L26 16 L12 31 L8 27 L18 16 L8 5 z ',
    chevronup: 'M1 20 L16 6 L31 20 L27 24 L16 14 L5 24 z',
    clock: 'M16 0 A16 16 0 0 0 0 16 A16 16 0 0 0 16 32 A16 16 0 0 0 32 16 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 28 16 A12 12 0 0 1 16 28 A12 12 0 0 1 4 16 A12 12 0 0 1 16 4 M14 6 L14 17.25 L22 22 L24.25 18.5 L18 14.75 L18 6z',
    clone: {
        path: 'M12,11 L16,11 L16,0 L5,0 L5,3 L12,3 L12,11 L12,11 Z M0,4 L11,4 L11,15 L0,15 L0,4 Z',
        attrs: { viewBox: '0 0 16 15' }
    },
    close: 'M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z ',
    countrymap: 'M19.4375,6.97396734 L27,8.34417492 L27,25.5316749 L18.7837192,23.3765689 L11.875,25.3366259 L11.875,25.3366259 L11.875,11.0941749 L11.1875,11.0941749 L11.1875,25.5316749 L5,24.1566749 L5,7.65667492 L11.1875,9.03167492 L18.75,6.90135976 L18.75,22.0941749 L19.4375,22.0941749 L19.4375,6.97396734 Z',
    connections: {
        path: 'M5.37815706,11.5570815 C5.55061975,11.1918363 5.64705882,10.783651 5.64705882,10.3529412 C5.64705882,9.93118218 5.55458641,9.53102128 5.38881053,9.1716274 L11.1846365,4.82475792 C11.6952189,5.33295842 12.3991637,5.64705882 13.1764706,5.64705882 C14.7358628,5.64705882 16,4.38292165 16,2.82352941 C16,1.26413718 14.7358628,0 13.1764706,0 C11.6170784,0 10.3529412,1.26413718 10.3529412,2.82352941 C10.3529412,3.2452884 10.4454136,3.64544931 10.6111895,4.00484319 L10.6111895,4.00484319 L4.81536351,8.35171266 C4.3047811,7.84351217 3.60083629,7.52941176 2.82352941,7.52941176 C1.26413718,7.52941176 0,8.79354894 0,10.3529412 C0,11.9123334 1.26413718,13.1764706 2.82352941,13.1764706 C3.59147157,13.1764706 4.28780867,12.8698929 4.79682555,12.3724528 L10.510616,16.0085013 C10.408473,16.3004758 10.3529412,16.6143411 10.3529412,16.9411765 C10.3529412,18.5005687 11.6170784,19.7647059 13.1764706,19.7647059 C14.7358628,19.7647059 16,18.5005687 16,16.9411765 C16,15.3817842 14.7358628,14.1176471 13.1764706,14.1176471 C12.3029783,14.1176471 11.5221273,14.5142917 11.0042049,15.1372938 L5.37815706,11.5570815 Z',
        attrs: { viewBox: '0 0 16 19.7647' }
    },
    contract: 'M18.0015892,0.327942852 L18.0015892,14 L31.6736463,14 L26.6544389,8.98079262 L32,3.63523156 L28.3647684,0 L23.0192074,5.34556106 L18.0015892,0.327942852 Z M14,31.6720571 L14,18 L0.327942852,18 L5.34715023,23.0192074 L0.00158917013,28.3647684 L3.63682073,32 L8.98238179,26.6544389 L14,31.6720571 Z',
    cursor_move: 'M14.8235294,14.8235294 L14.8235294,6.58823529 L17.1764706,6.58823529 L17.1764706,14.8235294 L25.4117647,14.8235294 L25.4117647,17.1764706 L17.1764706,17.1764706 L17.1764706,25.4117647 L14.8235294,25.4117647 L14.8235294,17.1764706 L6.58823529,17.1764706 L6.58823529,14.8235294 L14.8235294,14.8235294 L14.8235294,14.8235294 Z M16,0 L20.1176471,6.58823529 L11.8823529,6.58823529 L16,0 Z M11.8823529,25.4117647 L20.1176471,25.4117647 L16,32 L11.8823529,25.4117647 Z M32,16 L25.4117647,20.1176471 L25.4117647,11.8823529 L32,16 Z M6.58823529,11.8823529 L6.58823529,20.1176471 L0,16 L6.58823529,11.8823529 Z',
    cursor_resize: 'M17.4017952,6.81355995 L15.0488541,6.81355995 L15.0488541,25.6370894 L17.4017952,25.6370894 L17.4017952,6.81355995 Z M16.2253247,0.225324657 L20.3429717,6.81355995 L12.1076776,6.81355995 L16.2253247,0.225324657 Z M12.1076776,25.6370894 L20.3429717,25.6370894 L16.2253247,32.2253247 L12.1076776,25.6370894 Z',
    dashboards: 'M17,5.49100518 L17,10.5089948 C17,10.7801695 17.2276528,11 17.5096495,11 L26.4903505,11 C26.7718221,11 27,10.7721195 27,10.5089948 L27,5.49100518 C27,5.21983051 26.7723472,5 26.4903505,5 L17.5096495,5 C17.2281779,5 17,5.22788048 17,5.49100518 Z M18.5017326,14 C18.225722,14 18,13.77328 18,13.4982674 L18,26.5017326 C18,26.225722 18.22672,26 18.5017326,26 L5.49826741,26 C5.77427798,26 6,26.22672 6,26.5017326 L6,13.4982674 C6,13.774278 5.77327997,14 5.49826741,14 L18.5017326,14 Z M14.4903505,6 C14.2278953,6 14,5.78028538 14,5.49100518 L14,10.5089948 C14,10.2167107 14.2224208,10 14.4903505,10 L5.50964952,10 C5.77210473,10 6,10.2197146 6,10.5089948 L6,5.49100518 C6,5.78328929 5.77757924,6 5.50964952,6 L14.4903505,6 Z M26.5089948,22 C26.2251201,22 26,21.7774008 26,21.4910052 L26,26.5089948 C26,26.2251201 26.2225992,26 26.5089948,26 L21.4910052,26 C21.7748799,26 22,26.2225992 22,26.5089948 L22,21.4910052 C22,21.7748799 21.7774008,22 21.4910052,22 L26.5089948,22 Z M26.5089948,14 C26.2251201,14 26,13.7774008 26,13.4910052 L26,18.5089948 C26,18.2251201 26.2225992,18 26.5089948,18 L21.4910052,18 C21.7748799,18 22,18.2225992 22,18.5089948 L22,13.4910052 C22,13.7748799 21.7774008,14 21.4910052,14 L26.5089948,14 Z M26.4903505,6 C26.2278953,6 26,5.78028538 26,5.49100518 L26,10.5089948 C26,10.2167107 26.2224208,10 26.4903505,10 L17.5096495,10 C17.7721047,10 18,10.2197146 18,10.5089948 L18,5.49100518 C18,5.78328929 17.7775792,6 17.5096495,6 L26.4903505,6 Z M5,13.4982674 L5,26.5017326 C5,26.7769181 5.21990657,27 5.49826741,27 L18.5017326,27 C18.7769181,27 19,26.7800934 19,26.5017326 L19,13.4982674 C19,13.2230819 18.7800934,13 18.5017326,13 L5.49826741,13 C5.22308192,13 5,13.2199066 5,13.4982674 Z M5,5.49100518 L5,10.5089948 C5,10.7801695 5.22765279,11 5.50964952,11 L14.4903505,11 C14.7718221,11 15,10.7721195 15,10.5089948 L15,5.49100518 C15,5.21983051 14.7723472,5 14.4903505,5 L5.50964952,5 C5.22817786,5 5,5.22788048 5,5.49100518 Z M21,21.4910052 L21,26.5089948 C21,26.7801695 21.2278805,27 21.4910052,27 L26.5089948,27 C26.7801695,27 27,26.7721195 27,26.5089948 L27,21.4910052 C27,21.2198305 26.7721195,21 26.5089948,21 L21.4910052,21 C21.2198305,21 21,21.2278805 21,21.4910052 Z M21,13.4910052 L21,18.5089948 C21,18.7801695 21.2278805,19 21.4910052,19 L26.5089948,19 C26.7801695,19 27,18.7721195 27,18.5089948 L27,13.4910052 C27,13.2198305 26.7721195,13 26.5089948,13 L21.4910052,13 C21.2198305,13 21,13.2278805 21,13.4910052 Z',
    download: {
        path: 'M4,8 L4,0 L7,0 L7,8 L10,8 L5.5,13.25 L1,8 L4,8 Z M11,14 L0,14 L0,17 L11,17 L11,14 Z',
        attrs: { viewBox: '0 0 11 17' }
    },
    expand: 'M29,13.6720571 L29,8.26132482e-16 L15.3279429,8.64083276e-16 L20.3471502,5.01920738 L15.0015892,10.3647684 L18.6368207,14 L23.9823818,8.65443894 L29,13.6720571 Z M0.00158917013,15.3279429 L0.00158917013,29 L13.6736463,29 L8.65443894,23.9807926 L14,18.6352316 L10.3647684,15 L5.01920738,20.3455611 L0.00158917013,15.3279429 Z',
    explore: 'M16.4796545,16.298957 L16.4802727,23.0580389 L16.4802727,23.0580389 C17.3528782,23.2731238 18,24.0609902 18,25 C18,26.1045695 17.1045695,27 16,27 C14.8954305,27 14,26.1045695 14,25 C14,24.0751922 14.6276951,23.2969904 15.4802906,23.0681896 L15.4796772,16.3617812 L15.4796772,16.3617812 L9.42693239,19.2936488 C9.54250354,19.9090101 9.36818637,20.5691625 8.90013616,21.0538426 C8.13283771,21.8484034 6.86670062,21.8705039 6.07213982,21.1032055 C5.27757902,20.335907 5.25547851,19.06977 6.02277696,18.2752092 C6.79007541,17.4806484 8.0562125,17.4585478 8.8507733,18.2258463 C8.90464955,18.277874 8.95497425,18.3321952 9.00174214,18.3885073 L14.8957415,15.5335339 L8.95698016,12.663638 C8.54316409,13.1288103 7.91883307,13.3945629 7.25239963,13.3245179 C6.15388108,13.2090589 5.35695382,12.2249357 5.47241277,11.1264172 C5.58787172,10.0278986 6.57199493,9.23097136 7.67051349,9.34643031 C8.76903204,9.46188927 9.5659593,10.4460125 9.45050035,11.544531 C9.44231425,11.6224166 9.42976147,11.6987861 9.41311084,11.7734218 L15.4795257,14.705006 L15.4789062,7.93143834 C14.6270158,7.70216703 14,6.9243072 14,6 C14,4.8954305 14.8954305,4 16,4 C17.1045695,4 18,4.8954305 18,6 C18,6.93950562 17.3521946,7.72770818 16.4788902,7.94230133 L16.4795143,14.7663758 L22.5940736,11.8045661 C22.4397082,11.1620316 22.6068068,10.4567329 23.0998638,9.94615736 C23.8671623,9.15159656 25.1332994,9.12949606 25.9278602,9.8967945 C26.722421,10.664093 26.7445215,11.93023 25.977223,12.7247908 C25.2099246,13.5193516 23.9437875,13.5414522 23.1492267,12.7741537 C23.120046,12.7459743 23.0919072,12.717122 23.0648111,12.687645 L17.1917924,15.5324558 L23.0283963,18.3529842 C23.4420438,17.8775358 24.073269,17.604607 24.7476004,17.6754821 C25.8461189,17.7909411 26.6430462,18.7750643 26.5275872,19.8735828 C26.4121283,20.9721014 25.4280051,21.7690286 24.3294865,21.6535697 C23.230968,21.5381107 22.4340407,20.5539875 22.5494996,19.455469 C22.5569037,19.3850239 22.56788,19.315819 22.5822296,19.2480155 L16.4796545,16.298957 Z M16.0651172,6.99791382 C16.5870517,6.96436642 17,6.53040783 17,6 C17,5.44771525 16.5522847,5 16,5 C15.4477153,5 15,5.44771525 15,6 C15,6.53446591 15.4192913,6.9710011 15.9468816,6.99861337 L16.0651172,6.99791382 L16.0651172,6.99791382 Z M16,26 C16.5522847,26 17,25.5522847 17,25 C17,24.4477153 16.5522847,24 16,24 C15.4477153,24 15,24.4477153 15,25 C15,25.5522847 15.4477153,26 16,26 Z M6.56266251,20.102897 C6.80476821,20.5992873 7.40343746,20.8054256 7.89982771,20.5633199 C8.39621795,20.3212142 8.60235631,19.722545 8.36025061,19.2261547 C8.11814491,18.7297645 7.51947566,18.5236261 7.02308541,18.7657318 C6.52669517,19.0078375 6.32055681,19.6065068 6.56266251,20.102897 Z M23.6397494,11.7738453 C23.8818551,12.2702355 24.4805243,12.4763739 24.9769146,12.2342682 C25.4733048,11.9921625 25.6794432,11.3934932 25.4373375,10.897103 C25.1952318,10.4007127 24.5965625,10.1945744 24.1001723,10.4366801 C23.603782,10.6787858 23.3976437,11.277455 23.6397494,11.7738453 Z M25.4373375,20.102897 C25.6794432,19.6065068 25.4733048,19.0078375 24.9769146,18.7657318 C24.4805243,18.5236261 23.8818551,18.7297645 23.6397494,19.2261547 C23.3976437,19.722545 23.603782,20.3212142 24.1001723,20.5633199 C24.5965625,20.8054256 25.1952318,20.5992873 25.4373375,20.102897 Z M8.36025061,11.7738453 C8.60235631,11.277455 8.39621795,10.6787858 7.89982771,10.4366801 C7.40343746,10.1945744 6.80476821,10.4007127 6.56266251,10.897103 C6.32055681,11.3934932 6.52669517,11.9921625 7.02308541,12.2342682 C7.51947566,12.4763739 8.11814491,12.2702355 8.36025061,11.7738453 Z',
    filter: 'M6.57883011,7.57952565 L1.18660637e-12,-4.86721774e-13 L16,-4.92050845e-13 L9.42116989,7.57952565 L9.42116989,13.5542169 L6.57883011,15 L6.57883011,7.57952565 Z',
    gear: 'M14 0 H18 L19 6 L20.707 6.707 L26 3.293 L28.707 6 L25.293 11.293 L26 13 L32 14 V18 L26 19 L25.293 20.707 L28.707 26 L26 28.707 L20.707 25.293 L19 26 L18 32 L14 32 L13 26 L11.293 25.293 L6 28.707 L3.293 26 L6.707 20.707 L6 19 L0 18 L0 14 L6 13 L6.707 11.293 L3.293 6 L6 3.293 L11.293 6.707 L13 6 L14 0 z M16 10 A6 6 0 0 0 16 22 A6 6 0 0 0 16 10',
    grid: 'M2 2 L10 2 L10 10 L2 10z M12 2 L20 2 L20 10 L12 10z M22 2 L30 2 L30 10 L22 10z M2 12 L10 12 L10 20 L2 20z M12 12 L20 12 L20 20 L12 20z M22 12 L30 12 L30 20 L22 20z M2 22 L10 22 L10 30 L2 30z M12 22 L20 22 L20 30 L12 30z M22 22 L30 22 L30 30 L22 30z',
    history: 'M31.3510226,15.6624718 C31.3510226,23.4208104 25.0228069,29.7490261 17.2644683,29.7490261 C13.3633933,29.7490261 9.80936578,28.145223 7.2955414,25.5882133 L9.46263138,23.4208104 C11.4563542,25.3710349 14.2302293,26.6281036 17.2644683,26.6281036 C23.3326331,26.6281036 28.2301,21.7306367 28.2301,15.6624718 C28.2301,9.59430691 23.3326331,4.69652708 17.2644683,4.69652708 C11.9329575,4.69652708 7.4689086,8.38073652 6.47189074,13.4083853 L9.98273298,12.8882837 L4.99826955,19.8664699 L0.0573043855,12.8882837 L3.35128116,13.364887 C4.39148435,6.64706454 10.1995984,1.57591751 17.2644683,1.57591751 C25.0228069,1.57591751 31.3510226,7.86063493 31.3510226,15.6624718 Z M22.4222989,11.0679281 C24.2426545,10.2877757 25.4562249,13.1051492 23.6793675,13.9287998 L18.0449336,16.1825734 L16.8745485,19.3463683 C16.1810797,21.3400911 13.320521,20.04015 13.9704915,18.2629798 L15.3139308,14.5352721 C15.487298,14.1450394 15.7041635,13.8418033 16.0508979,13.7116214 L22.4222989,11.0679281 Z',
    line: 'M17.5684644,16.0668074 L15.9388754,14.3793187 L15.8968592,14.4198933 L15.8953638,14.4183447 L15.8994949,14.4142136 L15.6628229,14.1775415 L15.5851122,14.0970697 L15.5837075,14.0984261 L14.4852814,13 L7.56742615,19.9178552 L8.98163972,21.3320688 L14.4809348,15.8327737 L14.4809348,15.8327737 L16.1103863,17.52012 L16.1522861,17.4796579 L16.1522861,17.4796579 L16.1539209,17.4813508 L16.1500476,17.4852242 L16.3719504,17.707127 L16.4640332,17.8024814 L16.4656976,17.8008741 L17.5643756,18.8995521 L24.4820322,11.9818955 L23.0677042,10.5675676 L17.5684644,16.0668074 Z',
    list: 'M3 8 A3 3 0 0 0 9 8 A3 3 0 0 0 3 8 M12 6 L28 6 L28 10 L12 10z M3 16 A3 3 0 0 0 9 16 A3 3 0 0 0 3 16 M12 14 L28 14 L28 18 L12 18z M3 24 A3 3 0 0 0 9 24 A3 3 0 0 0 3 24 M12 22 L28 22 L28 26 L12 26z',
    lock: 'M8.8125,13.2659641 L5.50307055,13.2659641 C4.93891776,13.2659641 4.5,13.7132101 4.5,14.2649158 L4.5,30.8472021 C4.5,31.4051918 4.94908998,31.8461538 5.50307055,31.8461538 L26.4969294,31.8461538 C27.0610822,31.8461538 27.5,31.3989079 27.5,30.8472021 L27.5,14.2649158 C27.5,13.7069262 27.05091,13.2659641 26.4969294,13.2659641 L23.1875,13.2659641 L23.1875,7.18200446 C23.1875,3.22368836 19.9695466,0 16,0 C12.0385306,0 8.8125,3.21549292 8.8125,7.18200446 L8.8125,13.2659641 Z M12.3509615,7.187641 C12.3509615,5.17225484 13.9813894,3.53846154 15.9955768,3.53846154 C18.0084423,3.53846154 19.6401921,5.17309313 19.6401921,7.187641 L19.6401921,13.0473232 L12.3509615,13.0473232 L12.3509615,7.187641 Z',
    mine: 'M28.4907419,50 C25.5584999,53.6578499 21.0527692,56 16,56 C10.9472308,56 6.44150015,53.6578499 3.50925809,50 L28.4907419,50 Z M29.8594823,31.9999955 C27.0930063,27.217587 21.922257,24 16,24 C10.077743,24 4.9069937,27.217587 2.1405177,31.9999955 L29.8594849,32 Z M16,21 C19.8659932,21 23,17.1944204 23,12.5 C23,7.80557963 22,3 16,3 C10,3 9,7.80557963 9,12.5 C9,17.1944204 12.1340068,21 16,21 Z',
    number: 'M8,8.4963932 C8,8.22224281 8.22618103,8 8.4963932,8 L23.5036068,8 C23.7777572,8 24,8.22618103 24,8.4963932 L24,23.5036068 C24,23.7777572 23.773819,24 23.5036068,24 L8.4963932,24 C8.22224281,24 8,23.773819 8,23.5036068 L8,8.4963932 Z M12.136,19 L12.136,13.4 L11.232,13.4 C11.1999998,13.6133344 11.1333338,13.7919993 11.032,13.936 C10.9306662,14.0800007 10.8066674,14.1959996 10.66,14.284 C10.5133326,14.3720004 10.3480009,14.4333332 10.164,14.468 C9.97999908,14.5026668 9.78933432,14.5173334 9.592,14.512 L9.592,15.368 L11,15.368 L11,19 L12.136,19 Z M13.616,16.176 C13.616,16.7360028 13.6706661,17.2039981 13.78,17.58 C13.8893339,17.9560019 14.0373324,18.2559989 14.224,18.48 C14.4106676,18.7040011 14.6279988,18.8639995 14.876,18.96 C15.1240012,19.0560005 15.3866653,19.104 15.664,19.104 C15.9466681,19.104 16.2119988,19.0560005 16.46,18.96 C16.7080012,18.8639995 16.9266657,18.7040011 17.116,18.48 C17.3053343,18.2559989 17.4546661,17.9560019 17.564,17.58 C17.6733339,17.2039981 17.728,16.7360028 17.728,16.176 C17.728,15.6319973 17.6733339,15.1746685 17.564,14.804 C17.4546661,14.4333315 17.3053343,14.1360011 17.116,13.912 C16.9266657,13.6879989 16.7080012,13.5280005 16.46,13.432 C16.2119988,13.3359995 15.9466681,13.288 15.664,13.288 C15.3866653,13.288 15.1240012,13.3359995 14.876,13.432 C14.6279988,13.5280005 14.4106676,13.6879989 14.224,13.912 C14.0373324,14.1360011 13.8893339,14.4333315 13.78,14.804 C13.6706661,15.1746685 13.616,15.6319973 13.616,16.176 Z M14.752,16.176 C14.752,16.0799995 14.7533333,15.9640007 14.756,15.828 C14.7586667,15.6919993 14.7679999,15.5520007 14.784,15.408 C14.8000001,15.2639993 14.8266665,15.121334 14.864,14.98 C14.9013335,14.838666 14.953333,14.7120006 15.02,14.6 C15.086667,14.4879994 15.1719995,14.3973337 15.276,14.328 C15.3800005,14.2586663 15.5093326,14.224 15.664,14.224 C15.8186674,14.224 15.9493328,14.2586663 16.056,14.328 C16.1626672,14.3973337 16.2506663,14.4879994 16.32,14.6 C16.3893337,14.7120006 16.4413332,14.838666 16.476,14.98 C16.5106668,15.121334 16.5373332,15.2639993 16.556,15.408 C16.5746668,15.5520007 16.5853333,15.6919993 16.588,15.828 C16.5906667,15.9640007 16.592,16.0799995 16.592,16.176 C16.592,16.3360008 16.5866667,16.5293322 16.576,16.756 C16.5653333,16.9826678 16.5320003,17.2013323 16.476,17.412 C16.4199997,17.6226677 16.329334,17.8026659 16.204,17.952 C16.078666,18.1013341 15.8986678,18.176 15.664,18.176 C15.4346655,18.176 15.2586673,18.1013341 15.136,17.952 C15.0133327,17.8026659 14.9240003,17.6226677 14.868,17.412 C14.8119997,17.2013323 14.7786667,16.9826678 14.768,16.756 C14.7573333,16.5293322 14.752,16.3360008 14.752,16.176 Z M18.064,16.176 C18.064,16.7360028 18.1186661,17.2039981 18.228,17.58 C18.3373339,17.9560019 18.4853324,18.2559989 18.672,18.48 C18.8586676,18.7040011 19.0759988,18.8639995 19.324,18.96 C19.5720012,19.0560005 19.8346653,19.104 20.112,19.104 C20.3946681,19.104 20.6599988,19.0560005 20.908,18.96 C21.1560012,18.8639995 21.3746657,18.7040011 21.564,18.48 C21.7533343,18.2559989 21.9026661,17.9560019 22.012,17.58 C22.1213339,17.2039981 22.176,16.7360028 22.176,16.176 C22.176,15.6319973 22.1213339,15.1746685 22.012,14.804 C21.9026661,14.4333315 21.7533343,14.1360011 21.564,13.912 C21.3746657,13.6879989 21.1560012,13.5280005 20.908,13.432 C20.6599988,13.3359995 20.3946681,13.288 20.112,13.288 C19.8346653,13.288 19.5720012,13.3359995 19.324,13.432 C19.0759988,13.5280005 18.8586676,13.6879989 18.672,13.912 C18.4853324,14.1360011 18.3373339,14.4333315 18.228,14.804 C18.1186661,15.1746685 18.064,15.6319973 18.064,16.176 Z M19.2,16.176 C19.2,16.0799995 19.2013333,15.9640007 19.204,15.828 C19.2066667,15.6919993 19.2159999,15.5520007 19.232,15.408 C19.2480001,15.2639993 19.2746665,15.121334 19.312,14.98 C19.3493335,14.838666 19.401333,14.7120006 19.468,14.6 C19.534667,14.4879994 19.6199995,14.3973337 19.724,14.328 C19.8280005,14.2586663 19.9573326,14.224 20.112,14.224 C20.2666674,14.224 20.3973328,14.2586663 20.504,14.328 C20.6106672,14.3973337 20.6986663,14.4879994 20.768,14.6 C20.8373337,14.7120006 20.8893332,14.838666 20.924,14.98 C20.9586668,15.121334 20.9853332,15.2639993 21.004,15.408 C21.0226668,15.5520007 21.0333333,15.6919993 21.036,15.828 C21.0386667,15.9640007 21.04,16.0799995 21.04,16.176 C21.04,16.3360008 21.0346667,16.5293322 21.024,16.756 C21.0133333,16.9826678 20.9800003,17.2013323 20.924,17.412 C20.8679997,17.6226677 20.777334,17.8026659 20.652,17.952 C20.526666,18.1013341 20.3466678,18.176 20.112,18.176 C19.8826655,18.176 19.7066673,18.1013341 19.584,17.952 C19.4613327,17.8026659 19.3720003,17.6226677 19.316,17.412 C19.2599997,17.2013323 19.2266667,16.9826678 19.216,16.756 C19.2053333,16.5293322 19.2,16.3360008 19.2,16.176 Z',
    pencil: 'M4.7352182,19.1979208 L11.3429107,25.5873267 L24.069853,12.5293069 L17.4624587,6.1419802 L4.7352182,19.1979208 Z M9.63604523,27.3406931 L3.02805455,20.9509901 L0.238146568,29.9610891 L9.63604523,27.3406931 Z M23.4499066,0 L19.1734989,4.38653465 L25.7811914,10.7759406 L30.0575991,6.38732673 L23.4499066,0 Z',
    pie: 'M16.0113299,15.368011 L16.0113299,7.6605591 L16.0113246,7.66055936 C16.1469053,7.65372627 16.283376,7.65026855 16.4206543,7.65026855 C18.4538187,7.65026855 20.309836,8.40872524 21.7212043,9.65813664 L16.0113299,15.368011 Z M16.5768268,16.0595929 L24.4103638,16.0595929 C24.4171966,15.9240175 24.4206543,15.7875468 24.4206543,15.6502686 C24.4206543,13.5849976 23.6380543,11.7025127 22.35323,10.2831897 L16.5768268,16.0595929 Z M24.2956851,17.0665012 L15.0044217,17.0665012 L15.0044217,7.77523777 C11.2616718,8.44383611 8.4206543,11.7152747 8.4206543,15.6502686 C8.4206543,20.0685466 12.0023763,23.6502686 16.4206543,23.6502686 C20.3556481,23.6502686 23.6270867,20.8092511 24.2956851,17.0665012 L24.2956851,17.0665012 Z',
    pinmap: 'M15,16.8999819 L15,21 L16,23 L17,21.0076904 L17,16.8999819 C16.6768901,16.9655697 16.3424658,17 16,17 C15.6575342,17 15.3231099,16.9655697 15,16.8999819 L15,16.8999819 Z M16,16 C18.209139,16 20,14.209139 20,12 C20,9.790861 18.209139,8 16,8 C13.790861,8 12,9.790861 12,12 C12,14.209139 13.790861,16 16,16 Z',
    popular: 'M22.7319639,13.7319639 L16.5643756,19.8995521 L15.4656976,18.8008741 L15.4640332,18.8024814 L15.3719504,18.707127 L15.1500476,18.4852242 L15.1539209,18.4813508 L15.1522861,18.4796579 L15.1522861,18.4796579 L15.1103863,18.52012 L13.4809348,16.8327737 L13.4809348,16.8327737 L7.98163972,22.3320688 L6.56742615,20.9178552 L13.4852814,14 L14.5837075,15.0984261 L14.5851122,15.0970697 L14.6628229,15.1775415 L14.8994949,15.4142136 L14.8953638,15.4183447 L14.8968592,15.4198933 L14.9388754,15.3793187 L16.5684644,17.0668074 L16.5684644,17.0668074 L21.3176359,12.3176359 L19,10 L26,9 L25,16 L22.7319639,13.7319639 Z',
    sync: 'M16 2 A14 14 0 0 0 2 16 A14 14 0 0 0 16 30 A14 14 0 0 0 26 26 L 23.25 23 A10 10 0 0 1 16 26 A10 10 0 0 1 6 16 A10 10 0 0 1 16 6 A10 10 0 0 1 23.25 9 L19 13 L30 13 L30 2 L26 6 A14 14 0 0 0 16 2',
    return:'M15.3040432,11.8500793 C22.1434689,13.0450349 27.291257,18.2496116 27.291257,24.4890512 C27.291257,25.7084278 27.0946472,26.8882798 26.7272246,28.0064033 L26.7272246,28.0064033 C25.214579,22.4825472 20.8068367,18.2141694 15.3040432,17.0604596 L15.3040432,25.1841972 L4.70874296,14.5888969 L15.3040432,3.99359668 L15.3040432,3.99359668 L15.3040432,11.8500793 Z',
    reference: {
        path: 'M15.9670388,2.91102126 L14.5202438,1.46422626 L14.5202438,13.9807372 C14.5202438,15.0873683 13.6272253,15.9844701 12.5215507,15.9844701 L2.89359,15.9844701 C2.16147687,15.9844701 1.446795,15.6184135 1.446795,14.5376751 L11.0747557,14.5376751 C12.1786034,14.5376751 13.0734488,13.6501624 13.0734488,12.5467556 L13.0734488,0 L2.17890813,0 C0,0 0,0 0,2.17890813 L0,14.5202438 C0,16.6991519 1.81285157,17.4312651 3.62570313,17.4312651 L13.9704736,17.4312651 C15.0731461,17.4312651 15.9670388,16.5448165 15.9670388,15.4275322 L15.9670388,2.91102126 Z',
        attrs: { viewBox: '0 0 15.967 17.4313' }
    },
    search: 'M12 0 A12 12 0 0 0 0 12 A12 12 0 0 0 12 24 A12 12 0 0 0 18.5 22.25 L28 32 L32 28 L22.25 18.5 A12 12 0 0 0 24 12 A12 12 0 0 0 12 0 M12 4 A8 8 0 0 1 12 20 A8 8 0 0 1 12 4  ',
    star: 'M16 0 L21 11 L32 12 L23 19 L26 31 L16 25 L6 31 L9 19 L0 12 L11 11',
    statemap: 'M19.4375,6.97396734 L27,8.34417492 L27,25.5316749 L18.7837192,23.3765689 L11.875,25.3366259 L11.875,25.3366259 L11.875,11.0941749 L11.1875,11.0941749 L11.1875,25.5316749 L5,24.1566749 L5,7.65667492 L11.1875,9.03167492 L18.75,6.90135976 L18.75,22.0941749 L19.4375,22.0941749 L19.4375,6.97396734 Z',
    table:  'M13.6373197,13.6373197 L18.3626803,13.6373197 L18.3626803,18.3626803 L13.6373197,18.3626803 L13.6373197,13.6373197 Z M18.9533504,18.9533504 L23.6787109,18.9533504 L23.6787109,23.6787109 L18.9533504,23.6787109 L18.9533504,18.9533504 Z M13.6373197,18.9533504 L18.3626803,18.9533504 L18.3626803,23.6787109 L13.6373197,23.6787109 L13.6373197,18.9533504 Z M8.32128906,18.9533504 L13.0466496,18.9533504 L13.0466496,23.6787109 L8.32128906,23.6787109 L8.32128906,18.9533504 Z M8.32128906,8.32128906 L13.0466496,8.32128906 L13.0466496,13.0466496 L8.32128906,13.0466496 L8.32128906,8.32128906 Z M8.32128906,13.6373197 L13.0466496,13.6373197 L13.0466496,18.3626803 L8.32128906,18.3626803 L8.32128906,13.6373197 Z M18.9533504,8.32128906 L23.6787109,8.32128906 L23.6787109,13.0466496 L18.9533504,13.0466496 L18.9533504,8.32128906 Z M18.9533504,13.6373197 L23.6787109,13.6373197 L23.6787109,18.3626803 L18.9533504,18.3626803 L18.9533504,13.6373197 Z M13.6373197,8.32128906 L18.3626803,8.32128906 L18.3626803,13.0466496 L13.6373197,13.0466496 L13.6373197,8.32128906 Z',
    trash: 'M4.31904507,29.7285487 C4.45843264,30.9830366 5.59537721,32 6.85726914,32 L20.5713023,32 C21.8337371,32 22.9701016,30.9833707 23.1095264,29.7285487 L25.1428571,11.4285714 L2.28571429,11.4285714 L4.31904507,29.7285487 L4.31904507,29.7285487 Z M6.85714286,4.57142857 L8.57142857,0 L18.8571429,0 L20.5714286,4.57142857 L25.1428571,4.57142857 C27.4285714,4.57142857 27.4285714,9.14285714 27.4285714,9.14285714 L13.7142857,9.14285714 L-1.0658141e-14,9.14285714 C-1.0658141e-14,9.14285714 -1.0658141e-14,4.57142857 2.28571429,4.57142857 L6.85714286,4.57142857 L6.85714286,4.57142857 Z M9.14285714,4.57142857 L18.2857143,4.57142857 L17.1428571,2.28571429 L10.2857143,2.28571429 L9.14285714,4.57142857 L9.14285714,4.57142857 Z',
    "illustration-icon-pie": {
        svg: "<path d='M29.8065455,22.2351515 L15.7837576,15.9495758 L15.7837576,31.2174545 C22.0004848,31.2029091 27.3444848,27.5258182 29.8065455,22.2351515' fill='#78B5EC'></path><g id='Fill-1-+-Fill-3'><path d='M29.8065455,22.2351515 C30.7316364,20.2482424 31.2630303,18.0402424 31.2630303,15.7032727 C31.2630303,11.8138182 29.8220606,8.26763636 27.4569697,5.54472727 L15.7837576,15.9495758 L29.8065455,22.2351515' fill='#3875AC'></path><path d='M27.4569697,5.54472727 C24.6118788,2.26909091 20.4266667,0.188121212 15.7478788,0.188121212 C7.17963636,0.188121212 0.232727273,7.1350303 0.232727273,15.7032727 C0.232727273,24.2724848 7.17963636,31.2184242 15.7478788,31.2184242 C15.7604848,31.2184242 15.7721212,31.2174545 15.7837576,31.2174545 L15.7837576,15.9495758 L27.4569697,5.54472727' fill='#4C9DE6'></path></g>"
    },
    "illustration-icon-scalar": {
        svg: "<g id='Fill-1-+-Fill-2-+-Fill-3' transform='translate(0.000000, 8.000000)' fill='#4C9DE6'><path d='M1.56121212,13.28 L4.54787879,13.28 L4.54787879,3.8070303 C4.54787879,3.52290909 4.55757576,3.23490909 4.5769697,2.944 L2.09454545,5.06763636 C2.02957576,5.1190303 1.96460606,5.15587879 1.90060606,5.17915152 C1.83563636,5.20145455 1.77454545,5.21309091 1.71636364,5.21309091 C1.61939394,5.21309091 1.53212121,5.19272727 1.45454545,5.14909091 C1.3769697,5.10836364 1.31878788,5.05793939 1.28,4.99878788 L0.736969697,4.25309091 L4.86787879,0.673939394 L6.27393939,0.673939394 L6.27393939,13.28 L9.00848485,13.28 L9.00848485,14.5997576 L1.56121212,14.5997576 L1.56121212,13.28'></path><path d='M15.8535758,0.547878788 C16.4421818,0.547878788 16.992,0.635151515 17.5030303,0.810666667 C18.0130909,0.985212121 18.454303,1.23830303 18.8266667,1.57187879 C19.1980606,1.90448485 19.4899394,2.31078788 19.7042424,2.78884848 C19.9175758,3.26690909 20.0242424,3.80993939 20.0242424,4.41793939 C20.0242424,4.93478788 19.945697,5.41284848 19.7905455,5.85309091 C19.6363636,6.29236364 19.4259394,6.71418182 19.1602424,7.11854545 C18.8955152,7.52290909 18.5900606,7.91369697 18.2448485,8.29187879 C17.8986667,8.66909091 17.5321212,9.056 17.1432727,9.45066667 L13.4875152,13.1927273 C13.7464242,13.1219394 14.0082424,13.065697 14.2729697,13.024 C14.5386667,12.982303 14.793697,12.96 15.0390303,12.96 L19.6945455,12.96 C19.881697,12.96 20.0300606,13.0162424 20.1406061,13.1258182 C20.2501818,13.2353939 20.3054545,13.3779394 20.3054545,13.5524848 L20.3054545,14.5997576 L11.0341818,14.5997576 L11.0341818,14.0072727 C11.0341818,13.8850909 11.0584242,13.7590303 11.1078788,13.6300606 C11.1553939,13.5010909 11.2349091,13.3808485 11.3444848,13.2712727 L15.7963636,8.8 C16.1648485,8.42569697 16.5003636,8.0649697 16.8048485,7.71975758 C17.1083636,7.37454545 17.3682424,7.02642424 17.5844848,6.67733333 C17.801697,6.32727273 17.9675152,5.97430303 18.0848485,5.61551515 C18.2012121,5.25672727 18.2593939,4.87272727 18.2593939,4.46545455 C18.2593939,4.05915152 18.1944242,3.70133333 18.0654545,3.39490909 C17.9355152,3.08848485 17.7580606,2.83442424 17.5321212,2.63369697 C17.3052121,2.4329697 17.0404848,2.28363636 16.736,2.18278788 C16.4324848,2.08290909 16.1066667,2.03248485 15.7575758,2.03248485 C15.4075152,2.03248485 15.0846061,2.08387879 14.7878788,2.18763636 C14.4901818,2.29042424 14.2264242,2.43490909 13.9975758,2.61818182 C13.7677576,2.80339394 13.5738182,3.02060606 13.4157576,3.27369697 C13.2567273,3.52581818 13.1452121,3.80412121 13.0802424,4.10666667 C13.0288485,4.29478788 12.9512727,4.43054545 12.8484848,4.51393939 C12.7447273,4.59830303 12.6089697,4.6409697 12.4412121,4.6409697 C12.4082424,4.6409697 12.374303,4.6390303 12.3384242,4.63515152 C12.3035152,4.63224242 12.2627879,4.62836364 12.2172121,4.62157576 L11.3163636,4.46545455 C11.4065455,3.83224242 11.5810909,3.27175758 11.84,2.784 C12.0979394,2.29527273 12.4266667,1.88606061 12.8232727,1.55636364 C13.2208485,1.22763636 13.6775758,0.977454545 14.1905455,0.805818182 C14.7054545,0.634181818 15.2591515,0.547878788 15.8535758,0.547878788'></path><path d='M27.286303,0.547878788 C27.8749091,0.547878788 28.4179394,0.632242424 28.9153939,0.8 C29.4128485,0.968727273 29.8414545,1.20824242 30.2002424,1.51757576 C30.5590303,1.82884848 30.838303,2.20412121 31.0390303,2.64339394 C31.2397576,3.08266667 31.3396364,3.57139394 31.3396364,4.10666667 C31.3396364,4.54787879 31.2833939,4.93963636 31.1699394,5.28484848 C31.0574545,5.632 30.8945455,5.93551515 30.6850909,6.19733333 C30.4746667,6.45915152 30.2215758,6.68024242 29.9238788,6.86060606 C29.6261818,7.04290909 29.2935758,7.18739394 28.9250909,7.2969697 C29.8298182,7.53745455 30.5105455,7.9369697 30.966303,8.50036364 C31.4220606,9.06278788 31.6499394,9.76678788 31.6499394,10.6133333 C31.6499394,11.2533333 31.5287273,11.8293333 31.286303,12.3403636 C31.0438788,12.8504242 30.7122424,13.2848485 30.2923636,13.6436364 C29.8724848,14.0024242 29.3818182,14.2778182 28.8232727,14.4688485 C28.2647273,14.6589091 27.6644848,14.7549091 27.0244848,14.7549091 C26.2875152,14.7549091 25.6572121,14.6627879 25.1335758,14.4785455 C24.6099394,14.2933333 24.1667879,14.0412121 23.8050909,13.7163636 C23.4424242,13.3944242 23.145697,13.0104242 22.9129697,12.5682424 C22.6802424,12.1250909 22.4833939,11.6450909 22.3214545,11.1282424 L23.0584242,10.8169697 C23.1941818,10.7597576 23.3299394,10.729697 23.465697,10.729697 C23.5946667,10.729697 23.7100606,10.7578182 23.8099394,10.8121212 C23.9098182,10.8673939 23.9854545,10.953697 24.0378182,11.0700606 C24.0504242,11.0952727 24.064,11.1233939 24.0766061,11.1524848 C24.0892121,11.1806061 24.1027879,11.2126061 24.1153939,11.2446061 C24.2065455,11.4317576 24.3161212,11.6441212 24.4450909,11.8797576 C24.5740606,12.1153939 24.7495758,12.3374545 24.9687273,12.544 C25.1888485,12.7505455 25.4613333,12.9250909 25.7881212,13.0676364 C26.1149091,13.2092121 26.5202424,13.28 27.0050909,13.28 C27.4899394,13.28 27.9146667,13.2014545 28.2802424,13.0424242 C28.6458182,12.8843636 28.9493333,12.6787879 29.1917576,12.4266667 C29.4341818,12.1755152 29.6174545,11.894303 29.7396364,11.5830303 C29.8627879,11.273697 29.9238788,10.9672727 29.9238788,10.6627879 C29.9238788,10.2875152 29.8734545,9.94521212 29.7735758,9.63490909 C29.673697,9.32363636 29.4923636,9.056 29.2305455,8.82909091 C28.9687273,8.60315152 28.6070303,8.42569697 28.1444848,8.29672727 C27.6819394,8.16775758 27.0894545,8.10181818 26.3650909,8.10181818 L26.3650909,6.84218182 C26.953697,6.84218182 27.456,6.78012121 27.8729697,6.6569697 C28.2899394,6.53478788 28.6312727,6.36606061 28.896,6.15369697 C29.1607273,5.94036364 29.353697,5.68436364 29.4729697,5.38763636 C29.5922424,5.08993939 29.6523636,4.76024242 29.6523636,4.39854545 C29.6523636,3.99709091 29.5893333,3.6489697 29.4632727,3.35127273 C29.3372121,3.05357576 29.1646061,2.80727273 28.9444848,2.61333333 C28.7243636,2.42036364 28.4644848,2.27490909 28.1638788,2.17793939 C27.8632727,2.08 27.5384242,2.03248485 27.1893333,2.03248485 C26.8402424,2.03248485 26.5173333,2.08387879 26.2196364,2.18763636 C25.9229091,2.29042424 25.6591515,2.43490909 25.4293333,2.61818182 C25.1995152,2.80242424 25.0075152,3.02157576 24.8523636,3.27757576 C24.6972121,3.53260606 24.5808485,3.808 24.5032727,4.10472727 C24.4518788,4.29284848 24.374303,4.42763636 24.2705455,4.512 C24.1667879,4.59539394 24.0349091,4.63806061 23.8729697,4.63806061 C23.8409697,4.63806061 23.8060606,4.63612121 23.7711515,4.63321212 C23.7352727,4.62933333 23.6955152,4.62448485 23.6499394,4.61866667 L22.7481212,4.46545455 C22.838303,3.83224242 23.0138182,3.27175758 23.2717576,2.784 C23.5306667,2.29527273 23.8584242,1.88606061 24.256,1.55636364 C24.6535758,1.22763636 25.1093333,0.977454545 25.6232727,0.805818182 C26.1372121,0.634181818 26.6918788,0.547878788 27.286303,0.547878788'></path></g>"
    },
    "illustration-icon-table": {
        svg: "<g transform='translate(0.000000, 2.000000)'><path d='M0,0 L32,0 L32,29 L0,29 L0,0 Z' fill='#4C9DE6'></path><g id='Fill-2-+-Fill-3-+-Fill-4' transform='translate(1.000000, 25.000000)' fill='#78B5EC'><path d='M0,0 L8,0 L8,3 L0,3 L0,0 Z'></path><path d='M9,0 L21,0 L21,3 L9,3 L9,0 Z'></path><path d='M22,0 L30,0 L30,3 L22,3 L22,0 Z'></path></g><g id='Fill-2-+-Fill-3-+-Fill-4-Copy' transform='translate(1.000000, 21.000000)' fill='#78B5EC'><path d='M0,0 L8,0 L8,3 L0,3 L0,0 Z'></path><path d='M9,0 L21,0 L21,3 L9,3 L9,0 Z'></path><path d='M22,0 L30,0 L30,3 L22,3 L22,0 Z'></path></g><g id='Fill-2-+-Fill-3-+-Fill-4-Copy-2' transform='translate(1.000000, 17.000000)' fill='#78B5EC'><path d='M0,0 L8,0 L8,3 L0,3 L0,0 Z'></path><path d='M9,0 L21,0 L21,3 L9,3 L9,0 Z'></path><path d='M22,0 L30,0 L30,3 L22,3 L22,0 Z'></path></g><g id='Fill-2-+-Fill-3-+-Fill-4-Copy-3' transform='translate(1.000000, 13.000000)' fill='#78B5EC'><path d='M0,0 L8,0 L8,3 L0,3 L0,0 Z'></path><path d='M9,0 L21,0 L21,3 L9,3 L9,0 Z'></path><path d='M22,0 L30,0 L30,3 L22,3 L22,0 Z'></path></g><g id='Fill-2-+-Fill-3-+-Fill-4-Copy-4' transform='translate(1.000000, 9.000000)' fill='#78B5EC'><path d='M0,0 L8,0 L8,3 L0,3 L0,0 Z'></path><path d='M9,0 L21,0 L21,3 L9,3 L9,0 Z'></path><path d='M22,0 L30,0 L30,3 L22,3 L22,0 Z'></path></g><path d='M1,1 L31,1 L31,8 L1,8 L1,1 Z' fill='#3875AC'></path></g>"
    },
    "illustration-icon-bars": {
        svg: "<g><path d='M5,15 L11,15 L11,31 L5,31 L5,15 Z' fill='#78B5EC'></path><path d='M13,0 L19,0 L19,31 L13,31 L13,0 Z' fill='#4C9DE6'></path><path d='M21,7 L27,7 L27,31 L21,31 L21,7 Z' fill='#3875AC'></path><path d='M0,31 L32,31 L32,32 L0,32 L0,31 Z' fill='#4C9DE6'></path></g>"
    },
};

export function loadIcon(name) {
    var def = ICON_PATHS[name];
    if (name && def == undefined) {
        console.warn('Icon "' + name + '" does not exist.');
    }

    var icon = {
        attrs: {
            className: 'Icon Icon-' + name,
            width: '32px',
            height: '32px',
            viewBox: '0 0 32 32',
            fill: 'currentcolor'
        },
        svg: undefined,
        path: undefined
    };

    if (typeof def === 'string') {
        icon.path = def;
    } else if (def != null) {
        var { svg, path, attrs } = def;
        for (var attr in attrs) {
            icon.attrs[attr] = attrs[attr];
        }
        icon.path = path;
        icon.svg = svg;
    }

    return icon;
}
