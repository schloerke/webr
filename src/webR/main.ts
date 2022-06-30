import * as Synclink from 'synclink';
import { WebRBackend, WebROptions } from './webR';
import { AsyncQueue } from './queue';

type WebRInput = {
  type: string;
  data: any;
};
type WebROutput = {
  type: string;
  text: string;
};

export interface WebRBackendQueue {
  getConsoleInput(): Promise<string>;
  pushOutput(x: WebROutput): void
}

export class WebR implements WebRBackend {
  #worker;
  #backend;

  #busy = false;
  #inputQueue = new AsyncQueue<WebRInput>();
  #outputQueue = new AsyncQueue<WebROutput>();

  // This nested class is meant to be proxied and sent to the backend
  // worker. It is nested so it has access to private properties of `WebR`.
  #glue = new class WebRGlue implements WebRBackendQueue {
    #super;
    constructor(webR: WebR) { this.#super = webR; }

    async getConsoleInput() {
      let input = await this.#super.#inputQueue.get();
      return input.data;
    }

    pushOutput(x: WebROutput) {
      this.#super.#outputQueue.put(x);
    }
  }(this)

  constructor() {
    this.#worker = new Worker('./webR.js');
    this.#backend = Synclink.wrap(this.#worker) as WebRBackend;
  }

  async init(options: WebROptions = {}) {
    // The second argument passes a Synclink-proxied version of
    // `this`. The worker can call the methods of this proxy
    // synchronously or asynchronously.
    return this.#backend.init(options, Synclink.proxy(this.#glue) as any);
  }

  isBusy() {
    return this.#busy;
  }

  putConsoleInput(input: string) {
    this.#inputQueue.put({ type: 'text', data: input });
    this.#busy = true;
  };

  async readOutput() {
    return await this.#outputQueue.get();
  }

  // Backend delegation
  async runRCode(code: string) { return this.#backend.runRCode(code) };
  async putFileData(name: string, data: Uint8Array) { return this.#backend.putFileData(name, data) }
  async getFileData(name: string) { return this.#backend.getFileData(name) }
  async getFSNode(path: string) { return this.#backend.getFSNode(path) }
  async loadPackages(packages: string[]) { return this.#backend.loadPackages(packages) }
  async isLoaded(pkg: string) { return this.#backend.isLoaded(pkg) }
}
