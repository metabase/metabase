//
//  SettingsManager.h
//  Metabase
//
//  Created by Cam Saul on 9/22/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

NSString *LocalHostBaseURL();

@interface SettingsManager : NSObject

+ (instancetype)instance;

@property (copy) NSString *baseURL;

@end
