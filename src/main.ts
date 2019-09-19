import {Aurelia} from 'aurelia-framework';

import process from 'process';
import {NotificationType} from './contracts/index';
import environment from './environment';
import {NotificationService} from './services/notification-service/notification.service';

import {oidcConfig} from './open-id-connect-configuration';

export function configure(aurelia: Aurelia): void {
  if (navigator.cookieEnabled === false) {
    // eslint-disable-next-line no-restricted-globals
    const url: string = location.href;
    throw new Error(`In order to use the web version of BPMN Studio please enable cookies for this URL: ${url}.`);
  }

  if ((window as any).nodeRequire) {
    const ipcRenderer: any = (window as any).nodeRequire('electron').ipcRenderer;
    const newHost: string = ipcRenderer.sendSync('get_host');

    /**
     * Currently the internal PE is always connected via http.
     * This will be subject to change.
     */
    const processEngineBaseRouteWithProtocol: string = `http://${newHost}`;

    localStorage.setItem('InternalProcessEngineRoute', processEngineBaseRouteWithProtocol);

    aurelia.container.registerInstance('InternalProcessEngineBaseRoute', processEngineBaseRouteWithProtocol);
  } else {
    (window as any).process = process;
    localStorage.setItem('InternalProcessEngineRoute', environment.baseRoute);
    aurelia.container.registerInstance('InternalProcessEngineBaseRoute', null);
  }

  aurelia.use
    .standardConfiguration()
    .globalResources('modules/custom_elements/modal/modal.html')
    .feature('modules/fetch-http-client')
    .feature('services/dynamic-ui-service')
    .feature('services/notification-service')
    .feature('services/user-config-service')
    .feature('services/diagram-validation-service')
    .feature('modules/management-api_client')
    .feature('services/process-engine-version-service')
    .feature('services/authentication-service')
    /*
     * The services/solution-explorer-services has a hard dependency on
     * EventAggregator and AuthenticationService.
     */
    .feature('services/solution-explorer-services')
    .feature('modules/inspect/token-viewer')
    .feature('modules/inspect/inspect-correlation')
    .feature('services/diagram-creation-service')
    .feature('services/solution-service')
    .feature('modules/inspect/heatmap')
    .feature('modules/live-execution-tracker')
    .plugin('aurelia-bootstrap')
    .plugin('aurelia-validation')
    .plugin('aurelia-open-id-connect', () => oidcConfig);

  if (environment.debug) {
    aurelia.use.developmentLogging();
  }

  if (environment.testing) {
    aurelia.use.plugin('aurelia-testing');
  }

  aurelia.start().then(() => {
    aurelia.setRoot();

    const applicationRunsInElectron: boolean = (window as any).nodeRequire !== undefined;
    if (applicationRunsInElectron) {
      const ipcRenderer: any = (window as any).nodeRequire('electron').ipcRenderer;
      // subscribe to processengine status
      ipcRenderer.send('add_internal_processengine_status_listener');

      ipcRenderer.send('app_ready');

      // wait for status to be reported
      ipcRenderer.on('internal_processengine_status', (event: any, status: string, error: string) => {
        if (status !== 'error') {
          return;
        }
        /* This is the URL to an issue in GitHub, describing
         * what the user can do about this failure.
         *
         * TODO: Implement a proper FAQ section and link to that.
         */
        const targetHref: string =
          "<a href=\"javascript:nodeRequire('open')('https://github.com/process-engine/bpmn-studio/issues/316')\">click here</a>";

        const errorMessage: string = `Failed to start ProcessEngine. For further information ${targetHref}.`;
        const notificationService: NotificationService = aurelia.container.get('NotificationService');

        notificationService.showNonDisappearingNotification(NotificationType.ERROR, errorMessage);
      });
    }
  });
}
