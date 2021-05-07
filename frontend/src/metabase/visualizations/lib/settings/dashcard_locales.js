
const TITLE_LOCALES_BN = {
  'sample.question': {
      'en': "Sample Question",
      'bn': "স্যাম্পল প্রশ্ন"
  },
  'admin.dashboard.total.schools': {
      'en': 'Total Schools',
      'bn': 'মোট বিদ্যালয়'
  },
  'admin.dashboard.school.type': {
      'en': 'School Type',
      'bn': 'বিদ্যালয়ের ধরণ'
  },
  'admin.dashboard.school.grade': {
      'en': 'School Grade',
      'bn': 'বিদ্যালয়ের গ্রেড'
  },
  'admin.dashboard.statistics.school': {
      'en': 'Statistics at a glance',
      'bn': 'একনজরে বিদ্যালয়ের পরিসংখ্যান'
  }, 
  'admin.dashboard.building.condition': {
      'en': 'Condition of Building',
      'bn': 'ভবনের অবস্থা'
  },
  'admin.dashboard.room.condition': {
      'en': 'Condition of Rooms',
      'bn': 'শ্রেণীকক্ষের অবস্থা'
  },
  'admin.dashboard.toilet.condition': {
      'en': 'Condition of toilets',
      'bn': 'টয়লেটের অবস্থা'
  },
  'admin.dashboard.school.profile.completion': {
      'en': 'Profile completion percentage of schools',
      'bn': 'বিদ্যালয়ের প্রোফাইল পূরণের শতাংশ'
  }, 
  'admin.dashboard.teacher.approved.post': {
      'en': 'Approved Posts',
      'bn': 'অনুমোদিত পদ'
  }, 
  'admin.dashboard.teacher.active.post': {
      'en': 'Active Posts',
      'bn': 'সক্রিয় পদ'
  }, 
  'admin.dashboard.teacher.vacant.post': {
      'en': 'Vacant Posts',
      'bn': 'শূন্য পদ'
  },
  'admin.dashboard.teacher.education': {
      'en': 'Statistics of Education Degree',
      'bn': 'শিক্ষাগত ডিগ্রীর পরিসংখ্যান'
  }, 
  'admin.dashboard.teacher.gender': {
      'en': 'Statistics of Gender',
      'bn': 'লিঙ্গ পরিসংখ্যান'
  },
  'admin.dashboard.teacher.job.post': {
      'en': 'Statistics of Job Post',
      'bn': 'জব পোস্টের পরিসংখ্যান'
  },
  'admin.dashboard.teacher.age': {
      'en': 'Statistics of Age Group',
      'bn': 'বয়সের গ্রুপের পরিসংখ্যান'
  },
  'admin.dashboard.teacher.c-in-ed.bp-in-ed': {
      'en': 'Statistics of C-in-Ed and Dp-in-Ed Training',
      'bn': 'সি-ইন-এড এবং ডিপি-ইন-এড ট্রেনিং এর পরিসংখ্যান'
  },
  'admin.dashboard.teacher.training': {
      'en': 'Statistics of Training',
      'bn': 'ট্রেনিং এর পরিসংখ্যান'
  },
  'admin.dashboard.teacher.job.status': {
      'en': 'Statistics of Job Status',
      'bn': 'জব স্ট্যাটাসের পরিসংখ্যান'
  }
}

export function dashcard_locale_title (locale, title_key) {
    locale = locale === 'bn'? locale: 'en';
    if(title_key in TITLE_LOCALES_BN) {
        return TITLE_LOCALES_BN[title_key][locale];
    }
    return title_key;
}
