import * as THREE from 'three';

export class Humanoid {
    constructor(color) {
        this.mesh = new THREE.Group();
        this.color = color;
        this.material = new THREE.MeshStandardMaterial({ color: this.color });
        this.skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa }); // Simple skin color

        this.initParts();
    }

    initParts() {
        // Head
        const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        this.head = new THREE.Mesh(headGeo, this.skinMaterial);
        this.head.position.y = 1.75;
        this.head.castShadow = true;
        this.mesh.add(this.head);

        // Body (Torso)
        const bodyGeo = new THREE.BoxGeometry(0.6, 0.9, 0.3);
        this.body = new THREE.Mesh(bodyGeo, this.material);
        this.body.position.y = 1.05;
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Arms
        const armGeo = new THREE.BoxGeometry(0.2, 0.9, 0.2);

        this.leftArm = new THREE.Mesh(armGeo, this.skinMaterial);
        this.leftArm.position.set(-0.4, 1.05, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, this.skinMaterial);
        this.rightArm.position.set(0.4, 1.05, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);

        this.leftLeg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x0000aa })); // Pants
        this.leftLeg.position.set(-0.15, 0.15, 0); // Pivot point logic roughly
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x0000aa }));
        this.rightLeg.position.set(0.15, 0.15, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

        // Offset everything so the origin (0,0,0) is at the feet/center bottom
        // Currently parts are absolute. The physics sphere is radius 1, centered at body.position.
        // We want the feet to be at y=0 relative to the physics body bottom? 
        // Standard cannon sphere is centered. 
        // If sphere is at (0, 5, 0) (center), the bottom is at (0, 4, 0).
        // Our mesh will be positioned at `body.position`. So mesh origin is center of sphere.
        // Humanoid feet should be at -1 y relative to center.

        this.mesh.position.y = -1;
    }

    update(time, isMoving) {
        if (isMoving) {
            const speed = 10;
            const angle = Math.sin(time * speed);

            this.leftArm.rotation.x = angle;
            this.rightArm.rotation.x = -angle;

            this.leftLeg.rotation.x = -angle;
            this.leftLeg.position.z = -Math.sin(time * speed) * 0.2;
            this.leftLeg.position.y = 0.15 + Math.abs(Math.cos(time * speed)) * 0.1;

            this.rightLeg.rotation.x = angle;
            this.rightLeg.position.z = Math.sin(time * speed) * 0.2;
            this.rightLeg.position.y = 0.15 + Math.abs(Math.cos(time * speed)) * 0.1;
        } else {
            // Reset
            this.leftArm.rotation.x = 0;
            this.rightArm.rotation.x = 0;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
            this.leftLeg.position.z = 0;
            this.rightLeg.position.z = 0;
        }
    }
}
