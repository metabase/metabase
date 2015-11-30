//
//  ResetPasswordWindowController.h
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

@import Cocoa;


@class ResetPasswordWindowController;


@protocol ResetPasswordWindowControllerDelegate <NSObject>
- (void)resetPasswordWindowController:(ResetPasswordWindowController *)resetPasswordWindowController didFinishWithResetToken:(NSString *)resetToken;
@end


@interface ResetPasswordWindowController : NSWindowController
@property (weak) id<ResetPasswordWindowControllerDelegate> delegate;
@end
