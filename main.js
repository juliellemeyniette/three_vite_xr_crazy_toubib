"use strict";

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

// import {
//   PerspectiveCamera,
//   Scene,
//   WebGLRenderer,
//   BoxGeometry,
//   Mesh,
//   MeshNormalMaterial,
//   AmbientLight,
//   Clock
// } from 'three';

// If you prefer to import the whole library, with the THREE prefix, use the following line instead:
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// NOTE: three/addons alias is supported by Rollup: you can use it interchangeably with three/examples/jsm/  

// Importing Ammo can be tricky.
// Vite supports webassembly: https://vitejs.dev/guide/features.html#webassembly
// so in theory this should work:
//
// import ammoinit from 'three/addons/libs/ammo.wasm.js?init';
// ammoinit().then((AmmoLib) => {
//  Ammo = AmmoLib.exports.Ammo()
// })
//
// But the Ammo lib bundled with the THREE js examples does not seem to export modules properly.
// A solution is to treat this library as a standalone file and copy it using 'vite-plugin-static-copy'.
// See vite.config.js
// 
// Consider using alternatives like Oimo or cannon-es



// import {
//   GLTFLoader
// } from 'three/addons/loaders/GLTFLoader.js';

//import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';


let container; // a dom el that has the renderED AR view
let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let reticle; 

let hitTestSource = null; // ce qui décla
let hitTestSourceRequested = false;

let raycaster;
const nbCubes = 1;

let world_cannon;
let floorBody;

const intersected = [];

// No organ map, so organ like colors
const organMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0.8, 0.2, 0.2),
  roughness: 0.5,
  metalness: 0.2,
  //map: organTexture
});

let controls, group;

var cubeCreated = false;

init();

function init() {
  raycaster = new THREE.Raycaster();

  container = document.createElement('div');
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  scene.background = new THREE.Color(0x000000); // Noir

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);


  // JU : added cannon world with gravity
  world_cannon = new CANNON.World();
  world_cannon.gravity.set(0, -9.82, 0); // Gravity pointing downward
  world_cannon.defaultContactMaterial.friction = 0.4;

  // JU : this is for the floor
  floorBody = new CANNON.Body({
    mass: 0, // Infinite mass, floor doesn't move
    shape: new CANNON.Plane(),
  });
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to lie flat
  world_cannon.addBody(floorBody);



  // Floor
  const floorGeometry = new THREE.PlaneGeometry( 6, 6 );
  const floorMaterial = new THREE.ShadowMaterial( { opacity: 0.25, blending: THREE.CustomBlending, transparent: false } );
  const floor = new THREE.Mesh( floorGeometry, floorMaterial );
  floor.rotation.x = - Math.PI / 2;
  floor.receiveShadow = true;
  scene.add( floor );

  group = new THREE.Group();
  scene.add(group);


  // renderer settings

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  //

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  // Détecter l'entrée et la sortie du mode AR
  renderer.xr.addEventListener('sessionstart', () => {
    scene.background = null; // Fond transparent en mode AR
  });

  renderer.xr.addEventListener('sessionend', () => {
    scene.background = new THREE.Color(0x000000); // Fond noir hors mode AR
  });

  // controllers

  controller1 = renderer.xr.getController( 0 );
  controller1.addEventListener( 'selectstart', onSelectStart );
  controller1.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller1 );

  controller2 = renderer.xr.getController( 1 );
  controller2.addEventListener( 'selectstart', onSelectStart );
  controller2.addEventListener( 'selectend', onSelectEnd );
  scene.add( controller2 );

  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 );

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(- Math.PI / 2),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  //

  const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );
  const line = new THREE.Line(geometry);
  line.name = 'line';
  line.scale.z = 5;

  controller1.add( line.clone() );
  controller2.add( line.clone() );

  raycaster = new THREE.Raycaster();

  window.addEventListener('resize', onWindowResize);

}
/* JU : will need to mix Three.js appearance 
with a cannon body that will react to gravity */
function createCube(position) {
  // Three.js Mesh
  const cubeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMaterial);
  cubeMesh.castShadow = true;
  scene.add(cubeMesh);
  meshes.push(cubeMesh);

  // Cannon.js Body
  const cubeBody = new CANNON.Body({
    mass: 1, // Affected by gravity
    shape: new CANNON.Box(new CANNON.Vec3(0.05, 0.05, 0.05)), // Box shape
    position: new CANNON.Vec3(position.x, position.y, position.z),
  });
  world_cannon.addBody(cubeBody);
  bodies.push(cubeBody); // stock le body
  cubeCreated = true;
  console.log(`Cube created at ${position.x}, ${position.y}, ${position.z}`);

  //checks if touching floor, not usefull
  cubeBody.addEventListener('collide', (event) => {
    if (event.body === floorBody) {
      console.log('Cube hit the floor!');
    }
  });
}

var meshes = [], bodies = [];

function onSelectStart(event) {

  const controller = event.target;

  const intersections = getIntersections( controller );

  if (!cubeCreated) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    reticle.matrix.decompose(position, quaternion, new THREE.Vector3());

    createCube(position, quaternion); // JU : calling function to see 
  }
  //cubeCreated = true;

  if ( intersections.length > 0 ) {

    const intersection = intersections[ 0 ];

    const object = intersection.object;
    object.material.emissive.b = 1;
    controller.attach( object );

    controller.userData.selected = object;

  }

  controller.userData.targetRayMode = event.data.targetRayMode;
}

function onSelectEnd( event ) {

  const controller = event.target;

  if ( controller.userData.selected !== undefined ) {

    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    group.attach( object );

    controller.userData.selected = undefined;

  }
}

function getIntersections( controller ) {

  controller.updateMatrixWorld();

  raycaster.setFromXRController( controller );

  return raycaster.intersectObjects( group.children, false );
  var meshes = [], bodies = [];
}


function intersectObjects( controller ) {

  // Do not highlight in mobile-ar

  if ( controller.userData.targetRayMode === 'screen' ) return;

  // Do not highlight when already selected

  if ( controller.userData.selected !== undefined ) return;

  const line = controller.getObjectByName( 'line' );
  const intersections = getIntersections( controller );

  if ( intersections.length > 0 ) {

    const intersection = intersections[ 0 ];

    const object = intersection.object;
    object.material.emissive.r = 1;
    intersected.push( object );

    line.scale.z = intersection.distance;

  } else {

    line.scale.z = 5;

  }

}

function cleanIntersected() {

  while ( intersected.length ) {

    const object = intersected.pop();
    object.material.emissive.r = 0;

  }

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}


// JU : to update Three.js bodies with the physic from cannon
function updatePhysics() {
  world_cannon.step(1 / 60); // Step the physics world forward, don't know why

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const mesh = meshes[i];
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}

//

function animate(timestamp, frame) {

  if (frame) {

    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (hitTestSourceRequested === false) {

      session.requestReferenceSpace('viewer').then(function (referenceSpace) {

        session.requestHitTestSource({ space: referenceSpace }).then(function (source) {

          hitTestSource = source;

        });

      });

      session.addEventListener('end', function () {

        hitTestSourceRequested = false;
        hitTestSource = null;

      });

      hitTestSourceRequested = true;

    }

    if (hitTestSource) {

      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {

        const hit = hitTestResults[0];

        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

      } else {

        reticle.visible = false;

      }

    }

  }
  cleanIntersected();
  intersectObjects( controller1 );
  intersectObjects( controller2 );

  updatePhysics();
  renderer.render(scene, camera);

}