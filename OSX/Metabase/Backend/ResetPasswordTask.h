//
//  ResetPasswordTask.h
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "JavaTask.h"

@interface ResetPasswordTask : JavaTask

/// blocks are ran on main thread <3
- (void)resetPasswordForEmailAddress:(NSString *)emailAddress success:(void(^)(NSString *resetToken))successBlock error:(void(^)(NSString *errorMessage))errorBlock;

@end
